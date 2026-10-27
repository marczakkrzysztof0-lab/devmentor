// Decyzja mentora: akceptacja i odrzucenie ze zwrotem (spec #18 Implementation Plan krok 1; bramka SDLC „money”
// i „data scoping”): kody odmów z ponownego odczytu, izolacja mentorów, jeden zwrot, e-maile bez treści pytania,
// awaria Stripe przy odrzuceniu.
import { test } from "node:test";
import assert from "node:assert/strict";
import { serverError } from "../payments/fake-stripe.mjs";
import { paymentRow } from "../payments/helpers.mjs";
import { acceptRequest, declineRequest } from "../../lib/requests/decision.mjs";
import { apartSlots, makeRequestDeps, paidRequest, QUESTION, seedMentor } from "../requests/fixtures.mjs";
import { describeDb } from "./harness.mjs";

describeDb("decyzja mentora (#18 krok 1)", (db) => {
  async function setup(count = 1) {
    const ctx = makeRequestDeps(db);
    const mentor = await seedMentor(db);
    const slots = await apartSlots(db, mentor.mentorId, count);
    const requests = [];
    for (const slot of slots) requests.push(await paidRequest(db, ctx, mentor, slot, { email: `kuba-${mentor.mentorId}@example.com` }));
    const deps = { db: db.pool, payments: ctx.deps };
    return { ctx, mentor, requests, deps, payer: `kuba-${mentor.mentorId}@example.com` };
  }
  const row = async (id) => (await db.query("select * from requests where id = $1", [id])).rows[0];
  const emails = async (to, template) => (await db.query("select * from outbound_emails where to_address = $1 and template = $2", [to, template])).rows;

  test("akceptacja: awaiting_mentor → accepted + accepted_at, e-mail request_accepted bez pytania, bez zwrotu", async () => {
    const { mentor, requests: [request], deps, ctx, payer } = await setup();
    const result = await acceptRequest({ mentorId: mentor.mentorId, requestId: request.id }, deps);
    assert.deepEqual(result, { ok: true, requestId: request.id, paymentId: request.paymentId, refund: null });
    const current = await row(request.id);
    assert.equal(current.status, "accepted");
    assert.ok(current.accepted_at);
    assert.equal((await paymentRow(db, request.paymentId)).refund_status, null);
    assert.equal(ctx.fake.count("refunds.create"), 0);
    const [email] = await emails(payer, "request_accepted");
    assert.equal(email.params.mentorName, "Anna K.");
    assert.equal(email.params.lengthMinutes, 25);
    assert.match(email.params.when, /\(Europe\/Warsaw\)$/);
    assert.ok(!JSON.stringify(email.params).includes(QUESTION.slice(0, 15)));
  });

  test("odrzucenie: declined + jeden zwrot mentor_declined wykonany od razu + jeden e-mail request_declined", async () => {
    const { mentor, requests: [request], deps, ctx, payer } = await setup();
    const result = await declineRequest({ mentorId: mentor.mentorId, requestId: request.id }, deps);
    assert.equal(result.ok, true);
    assert.equal(result.ok && result.refund, "requested");
    const current = await row(request.id);
    assert.equal(current.status, "declined");
    assert.ok(current.declined_at);
    const payment = await paymentRow(db, request.paymentId);
    assert.equal(payment.refund_reason, "mentor_declined");
    assert.equal(payment.refund_status, "succeeded");
    assert.equal(ctx.fake.count("refunds.create"), 1);
    const declined = await emails(payer, "request_declined");
    assert.equal(declined.length, 1);
    assert.equal(declined[0].params.amount, "150 zł");
    assert.ok(!JSON.stringify(declined[0].params).includes(QUESTION.slice(0, 15)));
  });

  test("podwójne odrzucenie → already_declined, jedno wywołanie Stripe; akceptacja po odrzuceniu → declined", async () => {
    const { mentor, requests: [request], deps, ctx, payer } = await setup();
    await declineRequest({ mentorId: mentor.mentorId, requestId: request.id }, deps);
    const again = await declineRequest({ mentorId: mentor.mentorId, requestId: request.id }, deps);
    assert.deepEqual(again, { ok: false, code: "already_declined", refundStatus: "succeeded" });
    assert.equal(ctx.fake.count("refunds.create"), 1);
    assert.equal((await emails(payer, "request_declined")).length, 1);
    const accept = await acceptRequest({ mentorId: mentor.mentorId, requestId: request.id }, deps);
    assert.equal(!accept.ok && accept.code, "declined");
    assert.equal((await row(request.id)).status, "declined");
  });

  test("akceptacja po anulowaniu / wygaśnięciu → cancelled / lapsed, stan bez zmian (AC negatywne)", async () => {
    const { mentor, requests: [a, b], deps } = await setup(2);
    await db.query("update requests set status = 'cancelled', cancelled_at = now() where id = $1", [a.id]);
    await db.query("update requests set status = 'lapsed', lapsed_at = now() where id = $1", [b.id]);
    assert.deepEqual(await acceptRequest({ mentorId: mentor.mentorId, requestId: a.id }, deps), { ok: false, code: "cancelled", refundStatus: null });
    const lapsed = await acceptRequest({ mentorId: mentor.mentorId, requestId: b.id }, deps);
    assert.equal(!lapsed.ok && lapsed.code, "lapsed");
    const lapsedDecline = await declineRequest({ mentorId: mentor.mentorId, requestId: b.id }, deps);
    assert.equal(!lapsedDecline.ok && lapsedDecline.code, "lapsed");
    assert.equal((await row(a.id)).status, "cancelled");
    assert.equal((await row(b.id)).status, "lapsed");
  });

  test("po akceptacji: druga akceptacja i odrzucenie → already_accepted, bez zwrotu", async () => {
    const { mentor, requests: [request], deps, ctx } = await setup();
    await acceptRequest({ mentorId: mentor.mentorId, requestId: request.id }, deps);
    assert.deepEqual(await acceptRequest({ mentorId: mentor.mentorId, requestId: request.id }, deps), { ok: false, code: "already_accepted" });
    assert.deepEqual(await declineRequest({ mentorId: mentor.mentorId, requestId: request.id }, deps), { ok: false, code: "already_accepted" });
    assert.equal(ctx.fake.count("refunds.create"), 0);
    assert.equal((await paymentRow(db, request.paymentId)).refund_status, null);
  });

  test("po starcie terminu (zegar wstrzyknięty) → slot_started dla akceptacji i odrzucenia; bez zwrotu", async () => {
    const { mentor, requests: [request], ctx } = await setup();
    const current = await row(request.id);
    const late = { db: db.pool, payments: ctx.deps, now: () => new Date(new Date(current.slot_start).getTime() + 60_000) };
    assert.deepEqual(await acceptRequest({ mentorId: mentor.mentorId, requestId: request.id }, late), { ok: false, code: "slot_started", refundStatus: null });
    const decline = await declineRequest({ mentorId: mentor.mentorId, requestId: request.id }, late);
    assert.equal(!decline.ok && decline.code, "slot_started");
    assert.equal((await row(request.id)).status, "awaiting_mentor");
    assert.equal((await paymentRow(db, request.paymentId)).refund_status, null);
  });

  test("izolacja: mentor B na zapytaniu mentora A → not_found w każdym stanie, nic się nie zmienia", async () => {
    const { requests: [request], deps } = await setup();
    const other = await seedMentor(db);
    for (const state of ["awaiting_mentor", "accepted", "declined", "lapsed", "cancelled"]) {
      if (state !== "awaiting_mentor") await db.query("update requests set status = $2 where id = $1", [request.id, state]);
      assert.deepEqual(await acceptRequest({ mentorId: other.mentorId, requestId: request.id }, deps), { ok: false, code: "not_found" }, state);
      assert.deepEqual(await declineRequest({ mentorId: other.mentorId, requestId: request.id }, deps), { ok: false, code: "not_found" }, state);
      assert.equal((await row(request.id)).status, state);
    }
    assert.equal((await paymentRow(db, request.paymentId)).refund_status, null);
  });

  test("zły kształt id, nieznane id i nieopłacone zapytanie → not_found bez błędu bazy", async () => {
    const { mentor, requests: [request], deps } = await setup();
    assert.deepEqual(await acceptRequest({ mentorId: mentor.mentorId, requestId: "1; drop table requests" }, deps), { ok: false, code: "not_found" });
    assert.deepEqual(await acceptRequest({ mentorId: mentor.mentorId, requestId: 42 }, deps), { ok: false, code: "not_found" });
    assert.deepEqual(await acceptRequest({ mentorId: mentor.mentorId, requestId: "00000000-0000-4000-8000-000000000000" }, deps), { ok: false, code: "not_found" });
    await db.query("update requests set status = 'payment_failed' where id = $1", [request.id]);
    assert.deepEqual(await declineRequest({ mentorId: mentor.mentorId, requestId: request.id }, deps), { ok: false, code: "not_found" });
  });

  test("Stripe nie działa przy odrzuceniu → decyzja zostaje (declined), zwrot requested do ponowienia", async () => {
    const { mentor, requests: [request], deps, ctx } = await setup();
    ctx.fake.fail("refunds.list", serverError, { times: 3 });
    const result = await declineRequest({ mentorId: mentor.mentorId, requestId: request.id }, deps);
    assert.equal(result.ok, true);
    assert.equal((await row(request.id)).status, "declined");
    const payment = await paymentRow(db, request.paymentId);
    assert.equal(payment.refund_status, "requested");
    assert.ok(new Date(payment.refund_next_attempt_at) > new Date(payment.refund_requested_at));
  });

  test("bez modułu płatności (payments: null) → zwrot tylko zlecony, dokończy zadanie", async () => {
    const { mentor, requests: [request] } = await setup();
    const result = await declineRequest({ mentorId: mentor.mentorId, requestId: request.id }, { db: db.pool, payments: null });
    assert.equal(result.ok, true);
    assert.equal((await paymentRow(db, request.paymentId)).refund_status, "requested");
  });
});
