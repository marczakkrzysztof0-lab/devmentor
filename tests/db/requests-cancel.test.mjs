// Anulowanie przez dewelopera (spec #19 Implementation Plan krok 1; bramka SDLC „money”): awaiting_mentor →
// cancelled + jeden zwrot mentee_cancelled (także po starcie terminu, D05), odmowy z API Contracts bez zmiany stanu,
// brak e-maila o samym anulowaniu, zniknięcie z „Czeka na decyzję” mentora, awaria Stripe.
import { test } from "node:test";
import assert from "node:assert/strict";
import { generateToken } from "../../lib/auth/tokens.mjs";
import { cancelByToken } from "../../lib/requests/cancel.mjs";
import { declineRequest } from "../../lib/requests/decision.mjs";
import { countAwaitingDecision, listMentorRequests } from "../../lib/requests/mentor.mjs";
import { startRequest } from "../../lib/requests/start.mjs";
import { serverError } from "../payments/fake-stripe.mjs";
import { paymentRow } from "../payments/helpers.mjs";
import { apartSlots, formInput, makeRequestDeps, paidRequest, seedMentor } from "../requests/fixtures.mjs";
import { describeDb } from "./harness.mjs";

describeDb("anulowanie przez dewelopera (#19 krok 1)", (db) => {
  async function setup(count = 1) {
    const ctx = makeRequestDeps(db);
    const mentor = await seedMentor(db);
    const slots = await apartSlots(db, mentor.mentorId, count);
    const requests = [];
    for (const slot of slots) requests.push(await paidRequest(db, ctx, mentor, slot, { email: `kuba-${mentor.mentorId}@example.com` }));
    return { ctx, mentor, requests, slots, deps: { db: db.pool, payments: ctx.deps }, payer: `kuba-${mentor.mentorId}@example.com` };
  }
  const row = async (id) => (await db.query("select * from requests where id = $1", [id])).rows[0];

  test("awaiting_mentor → cancelled + cancelled_at, jeden zwrot mentee_cancelled wykonany, bez e-maila o anulowaniu (AC)", async () => {
    const { ctx, mentor, requests: [request], deps, payer } = await setup();
    const { rows: before } = await db.query("select count(*)::int as n from outbound_emails where to_address = $1", [payer]);
    assert.deepEqual(await cancelByToken(request.token, deps), { ok: true, refund: "requested" });
    const current = await row(request.id);
    assert.equal(current.status, "cancelled");
    assert.ok(current.cancelled_at);
    const payment = await paymentRow(db, request.paymentId);
    assert.equal(payment.refund_reason, "mentee_cancelled");
    assert.equal(payment.refund_status, "succeeded");
    assert.equal(ctx.fake.count("refunds.create"), 1);
    // Jedyny nowy e-mail to „zwrot wykonany” (#17), nie o samym anulowaniu.
    const { rows: after } = await db.query("select template from outbound_emails where to_address = $1 order by created_at", [payer]);
    assert.deepEqual(after.slice(before[0].n).map((e) => e.template), ["refund_succeeded"]);
    // Mentor nie widzi go już jako otwartego (AC).
    const list = await listMentorRequests(db, { mentorId: mentor.mentorId, now: new Date() });
    assert.equal(list.find((r) => r.id === request.id)?.status, "cancelled");
    assert.equal(await countAwaitingDecision(db, { mentorId: mentor.mentorId, now: new Date() }), 0);
  });

  test("po starcie terminu, przed wygaśnięciem → anulowanie dozwolone, pełny zwrot (D05)", async () => {
    const { requests: [request], deps } = await setup();
    const slotStart = new Date((await row(request.id)).slot_start).getTime();
    const result = await cancelByToken(request.token, { ...deps, now: () => new Date(slotStart + 2 * 60_000) });
    assert.deepEqual(result, { ok: true, refund: "requested" });
    assert.equal((await paymentRow(db, request.paymentId)).refund_reason, "mentee_cancelled");
  });

  test("accepted → odmowa „accepted”, zwrot bez zmian (AC negatywne)", async () => {
    const { requests: [request], deps, ctx } = await setup();
    await db.query("update requests set status = 'accepted', accepted_at = now() where id = $1", [request.id]);
    assert.deepEqual(await cancelByToken(request.token, deps), { ok: false, reason: "accepted" });
    assert.equal((await row(request.id)).status, "accepted");
    assert.equal((await paymentRow(db, request.paymentId)).refund_status, null);
    assert.equal(ctx.fake.count("refunds.create"), 0);
  });

  test("declined / lapsed / drugie anulowanie → already_refunding z wygrywającym stanem, bez nowego zwrotu", async () => {
    const { mentor, requests: [declined, lapsed, cancelled], deps, ctx } = await setup(3);
    await declineRequest({ mentorId: mentor.mentorId, requestId: declined.id }, deps);
    await db.query("update requests set status = 'lapsed', lapsed_at = now() where id = $1", [lapsed.id]);
    await cancelByToken(cancelled.token, deps);
    const creates = ctx.fake.count("refunds.create");
    assert.deepEqual(await cancelByToken(declined.token, deps), { ok: false, reason: "already_refunding", status: "declined" });
    assert.deepEqual(await cancelByToken(lapsed.token, deps), { ok: false, reason: "already_refunding", status: "lapsed" });
    assert.deepEqual(await cancelByToken(cancelled.token, deps), { ok: false, reason: "already_refunding", status: "cancelled" });
    assert.equal(ctx.fake.count("refunds.create"), creates);
    assert.equal((await paymentRow(db, declined.paymentId)).refund_reason, "mentor_declined");
  });

  test("nieopłacone (awaiting_payment, payment_failed) → not_paid; nieznany / zły / wygasły token → not_found", async () => {
    const ctx = makeRequestDeps(db);
    const mentor = await seedMentor(db);
    const [first, second] = await apartSlots(db, mentor.mentorId, 2);
    const paid = await paidRequest(db, ctx, mentor, first);
    const deps = { db: db.pool, payments: ctx.deps };
    const started = await startRequest(formInput({ slug: mentor.slug, slot: second }), ctx.startDeps);
    assert.equal(started.ok, true, JSON.stringify(started));
    const { rows } = await db.query("select id from requests where mentor_id = $1 and status = 'awaiting_payment'", [mentor.mentorId]);
    const { rows: drafts } = await db.query("select params from outbound_emails where params ->> 'requestId' = $1", [rows[0].id]);
    const unpaidToken = drafts[0].params.requestUrl.split("/r/")[1];
    assert.deepEqual(await cancelByToken(unpaidToken, deps), { ok: false, reason: "not_paid" });
    await db.query("update requests set status = 'payment_failed' where id = $1", [rows[0].id]);
    assert.deepEqual(await cancelByToken(unpaidToken, deps), { ok: false, reason: "not_paid" });
    assert.deepEqual(await cancelByToken(generateToken(), deps), { ok: false, reason: "not_found" });
    assert.deepEqual(await cancelByToken("zły token", deps), { ok: false, reason: "not_found" });
    assert.deepEqual(await cancelByToken(undefined, deps), { ok: false, reason: "not_found" });
    const slotEnd = new Date((await row(paid.id)).slot_end).getTime();
    assert.deepEqual(await cancelByToken(paid.token, { ...deps, now: () => new Date(slotEnd + 31 * 86_400_000) }), { ok: false, reason: "not_found" });
    assert.equal((await row(paid.id)).status, "awaiting_mentor");
  });

  test("Stripe nie działa → cancelled od razu (termin wolny), zwrot requested do ponowienia", async () => {
    const { requests: [request], deps, ctx } = await setup();
    ctx.fake.fail("refunds.list", serverError, { times: 3 });
    assert.deepEqual(await cancelByToken(request.token, deps), { ok: true, refund: "requested" });
    assert.equal((await row(request.id)).status, "cancelled");
    assert.equal((await paymentRow(db, request.paymentId)).refund_status, "requested");
  });
});
