// Subskrybent płatności zapytań (spec #17 krok 5) i odczyt strony /r/{token} (krok 8, część domenowa).
import { test } from "node:test";
import assert from "node:assert/strict";
import { generateToken, hashToken } from "../../lib/auth/tokens.mjs";
import { expireCheckout, syncCheckout } from "../../lib/payments/payments.mjs";
import { startRequest } from "../../lib/requests/start.mjs";
import { getRequestByToken, isValidRequestToken } from "../../lib/requests/view.mjs";
import { formInput, makeRequestDeps, openSlots, QUESTION, seedMentor } from "../requests/fixtures.mjs";
import { describeDb } from "./harness.mjs";

async function started(db, ctx, mentor, slot) {
  const result = await startRequest(formInput({ slug: mentor.slug, slot }), ctx.startDeps);
  assert.equal(result.ok, true, JSON.stringify(result));
  const { rows } = await db.query(
    "select r.*, p.stripe_checkout_session_id as session_id from requests r join payments p on p.id = r.payment_id where r.mentor_id = $1 and r.slot_start = $2",
    [mentor.mentorId, slot.startsAt],
  );
  const { rows: drafts } = await db.query("select params from outbound_emails where params ->> 'requestId' = $1", [rows[0].id]);
  const token = drafts[0].params.requestUrl.split("/r/")[1];
  return { request: rows[0], token };
}

const emailsTo = async (db, to) => (await db.query("select * from outbound_emails where to_address = $1 order by created_at", [to])).rows;

describeDb("zapytanie: subskrybent płatności i strona /r/ (#17 krok 5, 8)", (db) => {
  test("płatność → awaiting_mentor + paid_at; potwierdzenie do płacącego i e-mail do mentora należne, bez treści pytania", async () => {
    const ctx = makeRequestDeps(db);
    const mentor = await seedMentor(db);
    const [slot] = await openSlots(db, mentor.mentorId);
    const { request, token } = await started(db, ctx, mentor, slot);
    ctx.fake.completeSession(request.session_id, { email: "kuba-dev@example.com" });
    await syncCheckout(request.payment_id, request.session_id, ctx.deps);

    const { rows } = await db.query("select status, paid_at from requests where id = $1", [request.id]);
    assert.equal(rows[0].status, "awaiting_mentor");
    assert.ok(rows[0].paid_at);
    const [confirmation] = await emailsTo(db, "kuba-dev@example.com");
    assert.equal(confirmation.status, "due");
    assert.equal(confirmation.template, "request_confirmation");
    const [toMentor] = await emailsTo(db, mentor.email);
    assert.equal(toMentor.template, "mentor_new_request");
    assert.equal(toMentor.params.menteeName, "Kuba");
    assert.match(toMentor.params.requestLink, /\/mentor\/requests\/[0-9a-f-]{36}$/);
    for (const email of [confirmation, toMentor]) assert.ok(!JSON.stringify(email.params).includes(QUESTION.slice(0, 15)));
    assert.ok(!JSON.stringify(toMentor.params).includes("kuba-dev@example.com"), "mentor nie dostaje e-maila płacącego");

    const view = await getRequestByToken(db, token, new Date());
    assert.equal(view.status, "awaiting_mentor");
    assert.equal(view.question, QUESTION);
    assert.equal(view.amountMinor, 15000);
    assert.equal(view.mentorSlug, mentor.slug);
  });

  test("anulowanie na Stripe (wygaszenie) → payment_failed, szkic usunięty, nic nie pobrane, mentor nic nie dostaje (AC)", async () => {
    const ctx = makeRequestDeps(db);
    const mentor = await seedMentor(db);
    const [slot] = await openSlots(db, mentor.mentorId);
    const { request, token } = await started(db, ctx, mentor, slot);
    assert.equal((await getRequestByToken(db, token, new Date())).status, "payment_pending");
    await expireCheckout(request.payment_id, ctx.deps);
    const view = await getRequestByToken(db, token, new Date());
    assert.equal(view.status, "payment_failed");
    assert.equal(view.refundStatus, null);
    assert.equal((await db.query("select count(*)::int as n from outbound_emails where params ->> 'requestId' = $1", [request.id])).rows[0].n, 0);
    assert.equal((await emailsTo(db, mentor.email)).length, 0);
  });

  test("anulowanie, gdy płatność zdążyła przejść → Opłacone (Stripe decyduje)", async () => {
    const ctx = makeRequestDeps(db);
    const mentor = await seedMentor(db);
    const [slot] = await openSlots(db, mentor.mentorId);
    const { request, token } = await started(db, ctx, mentor, slot);
    ctx.fake.completeSession(request.session_id);
    await expireCheckout(request.payment_id, ctx.deps);
    assert.equal((await getRequestByToken(db, token, new Date())).status, "awaiting_mentor");
  });

  test("płatność po karencji na termin zajęty przez kogoś innego → payment_failed, zwrot invalid_on_payment, e-mail „za późno”, bez podwójnej rezerwacji", async () => {
    const ctx = makeRequestDeps(db);
    const mentor = await seedMentor(db);
    const slot = (await openSlots(db, mentor.mentorId)).filter((s) => s.lengthMinutes === 25)[20]; // daleko od granicy 3 h
    const first = await started(db, ctx, mentor, slot);
    ctx.advance(44); // checkout_expires_at + 10 min minęło, Stripe jeszcze nie potwierdził wygaśnięcia
    const second = await startRequest(formInput({ slug: mentor.slug, slot }), { ...ctx.startDeps, now: ctx.deps.now });
    assert.equal(second.ok, true, "termin wrócił do oferty po karencji");
    ctx.fake.completeSession(first.request.session_id, { email: "spoznione@example.com" });
    await syncCheckout(first.request.payment_id, first.request.session_id, ctx.deps);

    const { rows } = await db.query(
      "select r.status, p.status as payment_status, p.refund_status, p.refund_reason from requests r join payments p on p.id = r.payment_id where r.id = $1",
      [first.request.id],
    );
    assert.deepEqual(rows[0], { status: "payment_failed", payment_status: "succeeded", refund_status: "requested", refund_reason: "invalid_on_payment" });
    assert.equal((await getRequestByToken(db, first.token, ctx.deps.now())).status, "late_payment");
    const [late] = await emailsTo(db, "spoznione@example.com");
    assert.equal(late.template, "request_late_payment");
    assert.match(late.params.requestUrl, /\/r\//);
    const { rows: holding } = await db.query("select count(*)::int as n from requests where mentor_id = $1 and status in ('awaiting_mentor', 'accepted')", [mentor.mentorId]);
    assert.equal(holding[0].n, 0, "spóźniona płatność nie zajęła terminu");
  });

  test("zwrot wykonany → e-mail do dewelopera", async () => {
    const ctx = makeRequestDeps(db);
    const mentor = await seedMentor(db);
    const [slot] = await openSlots(db, mentor.mentorId);
    const { request } = await started(db, ctx, mentor, slot);
    ctx.fake.completeSession(request.session_id, { email: "zwrot@example.com" });
    await syncCheckout(request.payment_id, request.session_id, ctx.deps);
    const { requestRefund, executeRefund } = await import("../../lib/payments/refunds.mjs");
    const { withTransaction } = await import("../../lib/db/pool.mjs");
    await withTransaction(db.pool, (tx) => requestRefund(tx, request.payment_id, "mentor_declined", ctx.deps));
    await executeRefund(request.payment_id, ctx.deps);
    const templates = (await emailsTo(db, "zwrot@example.com")).map((e) => e.template);
    assert.deepEqual(templates, ["request_confirmation", "refund_succeeded"]);
  });

  test("/r/{token}: nieznany i zły token → null; 30 dni po terminie → null", async () => {
    const ctx = makeRequestDeps(db);
    const mentor = await seedMentor(db);
    const [slot] = await openSlots(db, mentor.mentorId);
    const { token } = await started(db, ctx, mentor, slot);
    assert.equal(await getRequestByToken(db, generateToken(), new Date()), null);
    assert.equal(await getRequestByToken(db, "", new Date()), null);
    assert.equal(await getRequestByToken(db, 42, new Date()), null);
    assert.equal(await isValidRequestToken(db, token, new Date()), true);
    const after = new Date(Date.parse(slot.startsAt) + 25 * 60_000 + 30 * 86_400_000 + 1000);
    assert.equal(await getRequestByToken(db, token, after), null);
    assert.equal(await isValidRequestToken(db, token, after), false);
    assert.equal((await db.query("select count(*)::int as n from requests where access_token_hash = $1", [hashToken(token)])).rows[0].n, 1);
  });
});
