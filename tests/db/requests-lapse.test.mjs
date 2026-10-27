// Wygaśnięcie zapytania bez decyzji (spec #18 Phase 2, Implementation Plan krok 4; R09): zegar wstrzyknięty,
// lapsed + zwrot + e-mail + Stripe w tym samym przebiegu, idempotencja, dwa równoległe przebiegi, wyścigi
// akceptacji/odrzucenia z wygaśnięciem na dwóch połączeniach (jeden zwycięzca, najwyżej jeden zwrot).
import { test } from "node:test";
import assert from "node:assert/strict";
import { paymentRow } from "../payments/helpers.mjs";
import { acceptRequest, decideInTx, declineRequest } from "../../lib/requests/decision.mjs";
import { lapseOneInTx, lapseOverdue } from "../../lib/requests/lapse.mjs";
import { JOB_NAMES } from "../../lib/jobs/registry.mjs";
import { apartSlots, makeRequestDeps, paidRequest, QUESTION, seedMentor } from "../requests/fixtures.mjs";
import { holdTransaction, waitUntilBlocked } from "../requests/race.mjs";
import { describeDb } from "./harness.mjs";

describeDb("wygaśnięcie zapytań (#18 krok 4)", (db) => {
  async function setup(count = 1) {
    const ctx = makeRequestDeps(db);
    const mentor = await seedMentor(db);
    const slots = await apartSlots(db, mentor.mentorId, count);
    const requests = [];
    for (const slot of slots) requests.push(await paidRequest(db, ctx, mentor, slot, { email: `kuba-${mentor.mentorId}@example.com` }));
    return { ctx, mentor, requests, payer: `kuba-${mentor.mentorId}@example.com` };
  }
  const row = async (id) => (await db.query("select * from requests where id = $1", [id])).rows[0];
  /** Zegar „po terminie” dla wszystkich zapytań tego mentora: ostatni start + 1 min; zegar płatności też. */
  async function afterSlots(ctx, requests) {
    const starts = await Promise.all(requests.map(async (r) => new Date((await row(r.id)).slot_start).getTime()));
    const later = new Date(Math.max(...starts) + 60_000);
    ctx.clock.now = later;
    return () => new Date(later);
  }
  /** Przebieg zadania ograniczony do zapytań tego mentora nie jest możliwy (zadanie jest globalne) — liczymy wiersze. */
  const lapsedOf = async (mentorId) => (await db.query("select count(*)::int as n from requests where mentor_id = $1 and status = 'lapsed'", [mentorId])).rows[0].n;

  test("zadanie jest w rejestrze przed ponowieniami zwrotów i e-mailami", () => {
    assert.ok(JOB_NAMES.includes("requests.lapseOverdue"));
    assert.ok(JOB_NAMES.indexOf("requests.lapseOverdue") < JOB_NAMES.indexOf("payments.retryRefunds"));
    assert.ok(JOB_NAMES.indexOf("requests.lapseOverdue") < JOB_NAMES.indexOf("email.sendDue"));
  });

  test("przed terminem nic; po terminie: lapsed + zwrot lapsed wykonany + e-mail request_lapsed bez pytania; accepted nietknięte", async () => {
    const { ctx, mentor, requests: [overdue, accepted], payer } = await setup(2);
    await acceptRequest({ mentorId: mentor.mentorId, requestId: accepted.id }, { db: db.pool, payments: ctx.deps });
    await lapseOverdue({ db: db.pool, payments: ctx.deps, now: () => new Date() });
    assert.equal((await row(overdue.id)).status, "awaiting_mentor");

    const now = await afterSlots(ctx, [overdue, accepted]);
    await lapseOverdue({ db: db.pool, payments: ctx.deps, now });
    const current = await row(overdue.id);
    assert.equal(current.status, "lapsed");
    assert.ok(current.lapsed_at);
    const payment = await paymentRow(db, overdue.paymentId);
    assert.equal(payment.refund_reason, "lapsed");
    assert.equal(payment.refund_status, "succeeded");
    assert.equal(ctx.fake.count("refunds.create"), 1);
    const { rows: emails } = await db.query("select * from outbound_emails where to_address = $1 and template = 'request_lapsed'", [payer]);
    assert.equal(emails.length, 1);
    assert.ok(!JSON.stringify(emails[0].params).includes(QUESTION.slice(0, 15)));
    assert.equal((await row(accepted.id)).status, "accepted");
    assert.equal((await paymentRow(db, accepted.paymentId)).refund_status, null);
  });

  test("drugi przebieg nic nie zmienia (bez drugiego zwrotu ani e-maila)", async () => {
    const { ctx, mentor, requests, payer } = await setup(1);
    const now = await afterSlots(ctx, requests);
    await lapseOverdue({ db: db.pool, payments: ctx.deps, now });
    await lapseOverdue({ db: db.pool, payments: ctx.deps, now });
    assert.equal(await lapsedOf(mentor.mentorId), 1);
    assert.equal(ctx.fake.count("refunds.create"), 1);
    const { rows } = await db.query("select count(*)::int as n from outbound_emails where to_address = $1 and template = 'request_lapsed'", [payer]);
    assert.equal(rows[0].n, 1);
  });

  test("dwa równoległe przebiegi wygaszają każde zapytanie raz, jeden zwrot na płatność", async () => {
    const { ctx, mentor, requests } = await setup(3);
    const now = await afterSlots(ctx, requests);
    await Promise.all([lapseOverdue({ db: db.pool, payments: ctx.deps, now }), lapseOverdue({ db: db.pool, payments: ctx.deps, now })]);
    assert.equal(await lapsedOf(mentor.mentorId), 3);
    for (const request of requests) assert.equal((await paymentRow(db, request.paymentId)).refund_status, "succeeded");
    assert.equal(ctx.fake.count("refunds.create"), 3);
  });

  test("Stripe nie działa → lapsed + zwrot requested do ponowienia (zadanie retryRefunds)", async () => {
    const { ctx, requests: [request] } = await setup(1);
    const now = await afterSlots(ctx, [request]);
    ctx.fake.fail("refunds.list", () => Object.assign(new Error("down"), { statusCode: 500, type: "StripeAPIError" }), { times: 5 });
    await lapseOverdue({ db: db.pool, payments: ctx.deps, now });
    assert.equal((await row(request.id)).status, "lapsed");
    assert.equal((await paymentRow(db, request.paymentId)).refund_status, "requested");
  });

  test("wyścig: akceptacja trzyma wiersz → przebieg go pomija; po commicie accepted, bez zwrotu", async () => {
    const { ctx, mentor, requests: [request] } = await setup(1);
    const slotStart = new Date((await row(request.id)).slot_start).getTime();
    const held = await holdTransaction(db.pool, (tx) =>
      decideInTx(tx, "accept", { mentorId: mentor.mentorId, requestId: request.id }, { now: () => new Date(slotStart - 60_000) }),
    );
    assert.equal(held.result.ok, true);
    const now = await afterSlots(ctx, [request]);
    await lapseOverdue({ db: db.pool, payments: ctx.deps, now });
    await held.commit();
    assert.equal((await row(request.id)).status, "accepted");
    await lapseOverdue({ db: db.pool, payments: ctx.deps, now });
    assert.equal((await row(request.id)).status, "accepted");
    assert.equal((await paymentRow(db, request.paymentId)).refund_status, null);
    assert.equal(ctx.fake.count("refunds.create"), 0);
  });

  test("wyścig: wygaśnięcie trzyma wiersz → akceptacja czeka i dostaje lapsed; jeden zwrot", async () => {
    const { ctx, mentor, requests: [request] } = await setup(1);
    const now = await afterSlots(ctx, [request]);
    const held = await holdTransaction(db.pool, (tx) => lapseOneInTx(tx, { at: now(), stamp: now() }));
    assert.equal(held.result?.requestId, request.id);
    const slotStart = new Date((await row(request.id)).slot_start).getTime();
    const accept = acceptRequest({ mentorId: mentor.mentorId, requestId: request.id }, { db: db.pool, payments: null, now: () => new Date(slotStart - 60_000) });
    await waitUntilBlocked(db.pool, accept);
    await held.commit();
    const result = await accept;
    assert.equal(!result.ok && result.code, "lapsed");
    assert.equal((await row(request.id)).status, "lapsed");
    const payment = await paymentRow(db, request.paymentId);
    assert.equal(payment.refund_reason, "lapsed");
    assert.equal(payment.refund_status, "requested");
  });

  test("wyścig: odrzucenie i wygaśnięcie — jeden zwycięzca, jeden zwrot z powodem zwycięzcy", async () => {
    const { ctx, mentor, requests: [request] } = await setup(1);
    const slotStart = new Date((await row(request.id)).slot_start).getTime();
    const held = await holdTransaction(db.pool, (tx) =>
      decideInTx(tx, "decline", { mentorId: mentor.mentorId, requestId: request.id }, { now: () => new Date(slotStart - 60_000) }),
    );
    const now = await afterSlots(ctx, [request]);
    const run = lapseOverdue({ db: db.pool, payments: ctx.deps, now });
    // SKIP LOCKED: przebieg nie czeka na zablokowany wiersz.
    assert.deepEqual(await run, { lapsed: 0 });
    await held.commit();
    await lapseOverdue({ db: db.pool, payments: ctx.deps, now });
    assert.equal((await row(request.id)).status, "declined");
    const payment = await paymentRow(db, request.paymentId);
    assert.equal(payment.refund_reason, "mentor_declined");
    const again = await declineRequest({ mentorId: mentor.mentorId, requestId: request.id }, { db: db.pool, payments: ctx.deps });
    assert.equal(!again.ok && again.code, "already_declined");
  });
});
