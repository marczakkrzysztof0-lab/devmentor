// `startRequest` i zajęte przedziały (spec #17 Implementation Plan krok 3 i 4): cena z bazy, termin oferowany
// i niezajęty, wyścig o termin na dwóch połączeniach, powtórzony `submissionId`, ponowienie po błędzie Checkout.
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { heldRanges } from "../../lib/requests/held.mjs";
import { startRequest } from "../../lib/requests/start.mjs";
import { invalidRequestError, timeoutError } from "../payments/fake-stripe.mjs";
import { formInput, makeRequestDeps, openSlots, QUESTION, seedMentor } from "../requests/fixtures.mjs";
import { describeDb } from "./harness.mjs";

const countRequests = async (db, mentorId) => (await db.query("select count(*)::int as n from requests where mentor_id = $1", [mentorId])).rows[0].n;

describeDb("zapytanie opłacone z góry: startRequest (#17 krok 3–4)", (db) => {
  test("sukces: URL Checkout, zapytanie awaiting_payment, kwota = cena strony dla długości (AC), szkic e-maila z linkiem", async () => {
    const ctx = makeRequestDeps(db);
    const mentor = await seedMentor(db);
    const [slot] = (await openSlots(db, mentor.mentorId)).filter((s) => s.lengthMinutes === 50);
    const result = await startRequest(formInput({ slug: mentor.slug, slot, lengthMinutes: 50 }), ctx.startDeps);
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.ok(result.checkoutUrl.startsWith("https://checkout.stripe.test/"));
    const { rows } = await db.query(
      "select r.*, p.amount_minor, p.currency, p.status as payment_status from requests r join payments p on p.id = r.payment_id where r.mentor_id = $1",
      [mentor.mentorId],
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].status, "awaiting_payment");
    assert.equal(rows[0].amount_minor, 28000);
    assert.equal(rows[0].currency, "PLN");
    assert.equal(rows[0].question, QUESTION);
    assert.equal(rows[0].access_token_hash.length, 64);
    const { rows: emails } = await db.query("select * from outbound_emails where params ->> 'requestId' = $1", [rows[0].id]);
    assert.equal(emails.length, 1);
    assert.equal(emails[0].status, "draft");
    assert.match(emails[0].params.requestUrl, /^http:\/\/localhost:3000\/r\/[A-Za-z0-9_-]{43}$/);
    assert.ok(!JSON.stringify(emails[0].params).includes(QUESTION.slice(0, 15)), "pytanie nie trafia do e-maila");
    const create = ctx.fake.calls.find((c) => c.method === "checkout.sessions.create");
    assert.ok(!JSON.stringify(create.params).includes(QUESTION.slice(0, 15)), "pytanie nie trafia do Stripe");
    assert.ok(!JSON.stringify(create.params).includes("Kuba"), "imię nie trafia do Stripe");
    assert.match(create.params.success_url, /\/r\/[A-Za-z0-9_-]{43}\?checkout=return&session_id=\{CHECKOUT_SESSION_ID\}$/);
  });

  test("cena zmieniona → price_changed z nową ceną, nic nie zapisane", async () => {
    const ctx = makeRequestDeps(db);
    const mentor = await seedMentor(db);
    const [slot] = await openSlots(db, mentor.mentorId);
    const result = await startRequest(formInput({ slug: mentor.slug, slot, amount: 12000 }), ctx.startDeps);
    assert.deepEqual(result, { ok: false, code: "price_changed", newAmountMinor: 15000 });
    assert.equal(await countRequests(db, mentor.mentorId), 0);
  });

  test("termin poza dostępnością albo przed 3 h wyprzedzenia → slot_not_offered", async () => {
    const ctx = makeRequestDeps(db);
    const mentor = await seedMentor(db);
    const soon = new Date(Date.now() + 60 * 60_000);
    soon.setUTCMinutes(soon.getUTCMinutes() < 30 ? 30 : 60, 0, 0);
    const night = new Date(Date.now() + 3 * 86_400_000);
    night.setUTCHours(1, 0, 0, 0); // 02:00/03:00 w Warszawie — poza oknem 8–22
    for (const startsAt of [soon, night]) {
      const result = await startRequest(formInput({ slug: mentor.slug, slot: { startsAt: startsAt.toISOString() } }), ctx.startDeps);
      assert.deepEqual(result, { ok: false, code: "slot_not_offered" });
    }
    assert.equal(await countRequests(db, mentor.mentorId), 0);
  });

  test("termin zajęty (także nachodzący 50 min na 25 min) → slot_taken; trzymanie zwalnia się po payment_failed i po karencji", async () => {
    const ctx = makeRequestDeps(db);
    const mentor = await seedMentor(db);
    const slots = await openSlots(db, mentor.mentorId);
    const fifty = slots.find((s) => s.lengthMinutes === 50);
    assert.equal((await startRequest(formInput({ slug: mentor.slug, slot: fifty, lengthMinutes: 50 }), ctx.startDeps)).ok, true);
    const sameStart = await startRequest(formInput({ slug: mentor.slug, slot: fifty }), ctx.startDeps);
    assert.deepEqual(sameStart, { ok: false, code: "slot_taken" });
    const halfLater = { startsAt: new Date(Date.parse(fifty.startsAt) + 30 * 60_000).toISOString() };
    assert.deepEqual(await startRequest(formInput({ slug: mentor.slug, slot: halfLater }), ctx.startDeps), { ok: false, code: "slot_taken" });

    const now = ctx.deps.now();
    const window = { mentorId: mentor.mentorId, from: fifty.startsAt, to: new Date(Date.parse(fifty.startsAt) + 50 * 60_000), now };
    assert.equal((await heldRanges(db, window)).length, 1);
    // Po karencji (checkout_expires_at + 10 min) termin wraca, choć Stripe jeszcze nie potwierdził wygaśnięcia.
    assert.equal((await heldRanges(db, { ...window, now: new Date(now.getTime() + 44 * 60_000) })).length, 0);
    assert.equal((await heldRanges(db, { ...window, now: new Date(now.getTime() + 42 * 60_000) })).length, 1);
    // payment_failed zwalnia od razu.
    await db.query("update requests set status = 'payment_failed' where mentor_id = $1", [mentor.mentorId]);
    assert.equal((await heldRanges(db, window)).length, 0);
    // awaiting_mentor i accepted trzymają zawsze.
    await db.query("update requests set status = 'accepted', paid_at = now() where mentor_id = $1", [mentor.mentorId]);
    assert.equal((await heldRanges(db, { ...window, now: new Date(now.getTime() + 600 * 60_000) })).length, 1);
  });

  test("dwa równoczesne starty na dwóch połączeniach o ten sam termin → dokładnie jeden się udaje", async () => {
    const ctx = makeRequestDeps(db);
    const mentor = await seedMentor(db);
    const [slot] = await openSlots(db, mentor.mentorId);
    const second = new pg.Pool({ connectionString: db.databaseUrl, options: `-c search_path=${db.schema}`, max: 2 });
    try {
      const results = await Promise.all([
        startRequest(formInput({ slug: mentor.slug, slot }), ctx.startDeps),
        startRequest(formInput({ slug: mentor.slug, slot }), { ...ctx.startDeps, db: second, payments: { ...ctx.deps, db: second } }),
      ]);
      assert.deepEqual(results.map((r) => (r.ok ? "ok" : r.code)).sort(), ["ok", "slot_taken"]);
    } finally {
      await second.end();
    }
    assert.equal(await countRequests(db, mentor.mentorId), 1);
  });

  test("powtórzony submissionId → ta sama strona Stripe, jedno zapytanie, jedno wywołanie Stripe", async () => {
    const ctx = makeRequestDeps(db);
    const mentor = await seedMentor(db);
    const [slot] = await openSlots(db, mentor.mentorId);
    const input = formInput({ slug: mentor.slug, slot });
    const [a, b] = await Promise.all([startRequest(input, ctx.startDeps), startRequest(input, ctx.startDeps)]);
    const c = await startRequest(input, ctx.startDeps);
    assert.equal(a.ok && b.ok && c.ok, true, JSON.stringify([a, b, c]));
    assert.equal(a.checkoutUrl, c.checkoutUrl);
    assert.equal(b.checkoutUrl, c.checkoutUrl);
    assert.equal(await countRequests(db, mentor.mentorId), 1);
    assert.equal(ctx.fake.sessions.size, 1);
    // To samo id z innym terminem → odmowa (przeglądarka zrobi nowe id).
    const other = (await openSlots(db, mentor.mentorId)).find((s) => s.startsAt !== slot.startsAt && s.lengthMinutes === 25);
    assert.deepEqual(await startRequest({ ...input, slotStart: other.startsAt }, ctx.startDeps), { ok: false, code: "checkout_failed", retryable: false });
  });

  test("timeout Stripe → checkout_failed do ponowienia; ponowienie z tym samym id używa tego samego zapytania i płatności", async () => {
    const ctx = makeRequestDeps(db);
    const mentor = await seedMentor(db);
    const [slot] = await openSlots(db, mentor.mentorId);
    const input = formInput({ slug: mentor.slug, slot });
    ctx.fake.fail("checkout.sessions.create", timeoutError());
    assert.deepEqual(await startRequest(input, ctx.startDeps), { ok: false, code: "checkout_failed", retryable: true });
    const retried = await startRequest(input, ctx.startDeps);
    assert.equal(retried.ok, true);
    assert.equal(await countRequests(db, mentor.mentorId), 1);
    assert.equal((await db.query("select count(*)::int as n from payments p join requests r on r.payment_id = p.id where r.mentor_id = $1", [mentor.mentorId])).rows[0].n, 1);
  });

  test("błąd jednoznaczny Stripe → payment_failed, termin od razu wolny dla nowej próby", async () => {
    const ctx = makeRequestDeps(db);
    const mentor = await seedMentor(db);
    const [slot] = await openSlots(db, mentor.mentorId);
    ctx.fake.fail("checkout.sessions.create", invalidRequestError());
    assert.deepEqual(await startRequest(formInput({ slug: mentor.slug, slot }), ctx.startDeps), { ok: false, code: "checkout_failed", retryable: false });
    const { rows } = await db.query("select status from requests where mentor_id = $1", [mentor.mentorId]);
    assert.deepEqual(rows, [{ status: "payment_failed" }]);
    assert.equal((await db.query("select count(*)::int as n from outbound_emails e join requests r on e.params ->> 'requestId' = r.id::text where r.mentor_id = $1", [mentor.mentorId])).rows[0].n, 0, "szkic usunięty");
    assert.equal((await startRequest(formInput({ slug: mentor.slug, slot }), ctx.startDeps)).ok, true);
  });

  test("błędy pól, nieznana strona, brak płatności → nic nie zapisane", async () => {
    const ctx = makeRequestDeps(db);
    const mentor = await seedMentor(db);
    const [slot] = await openSlots(db, mentor.mentorId);
    const field = await startRequest(formInput({ slug: mentor.slug, slot, question: "   pomocy   " }), ctx.startDeps);
    assert.equal(field.ok, false);
    assert.equal(field.code, "field");
    assert.ok(field.errors.question);
    assert.deepEqual(await startRequest(formInput({ slug: "nie-ma-takiego", slot }), ctx.startDeps), { ok: false, code: "page_unavailable" });
    assert.deepEqual(await startRequest(formInput({ slug: mentor.slug, slot }), { ...ctx.startDeps, payments: null }), { ok: false, code: "payments_unavailable" });
    assert.equal(await countRequests(db, mentor.mentorId), 0);
    assert.ok(randomUUID());
  });
});
