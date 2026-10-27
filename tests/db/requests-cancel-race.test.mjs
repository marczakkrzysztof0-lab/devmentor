// Wyścigi anulowania z akceptacją, odrzuceniem i wygaśnięciem (spec #19, Implementation Plan krok 2; bramka pieniędzy):
// dwa połączenia, jeden zwycięzca, najwyżej jeden zwrot z powodem zwycięzcy. Wzorzec jak w requests-lapse.test.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { paymentRow } from "../payments/helpers.mjs";
import { cancelByToken, cancelByTokenInTx } from "../../lib/requests/cancel.mjs";
import { acceptRequest, decideInTx, declineRequest } from "../../lib/requests/decision.mjs";
import { lapseOneInTx, lapseOverdue } from "../../lib/requests/lapse.mjs";
import { apartSlots, makeRequestDeps, paidRequest, seedMentor } from "../requests/fixtures.mjs";
import { holdTransaction, waitUntilBlocked } from "../requests/race.mjs";
import { describeDb } from "./harness.mjs";

describeDb("wyścigi anulowania zapytań (#19 krok 2)", (db) => {
  async function setup() {
    const ctx = makeRequestDeps(db);
    const mentor = await seedMentor(db);
    const [slot] = await apartSlots(db, mentor.mentorId, 1);
    const request = await paidRequest(db, ctx, mentor, slot, { email: `kuba-${mentor.mentorId}@example.com` });
    return { ctx, mentor, request };
  }
  const row = async (id) => (await db.query("select * from requests where id = $1", [id])).rows[0];
  const slotStartOf = async (id) => new Date((await row(id)).slot_start).getTime();
  /** Zegar „przed startem terminu” dla strażnika akceptacji / odrzucenia. */
  const beforeSlot = async (id) => {
    const start = await slotStartOf(id);
    return () => new Date(start - 60_000);
  };
  /** Zegar „po starcie terminu” (wygaśnięcie); zegar płatności też. */
  const afterSlot = async (ctx, id) => {
    const later = new Date((await slotStartOf(id)) + 60_000);
    ctx.clock.now = later;
    return () => new Date(later);
  };

  test("akceptacja trzyma wiersz → anulowanie czeka i dostaje accepted; bez zwrotu", async () => {
    const { ctx, mentor, request } = await setup();
    const held = await holdTransaction(db.pool, async (tx) =>
      decideInTx(tx, "accept", { mentorId: mentor.mentorId, requestId: request.id }, { now: await beforeSlot(request.id) }),
    );
    assert.equal(held.result.ok, true);
    const cancel = cancelByToken(request.token, { db: db.pool, payments: ctx.deps });
    await waitUntilBlocked(db.pool, cancel);
    await held.commit();
    assert.deepEqual(await cancel, { ok: false, reason: "accepted" });
    assert.equal((await row(request.id)).status, "accepted");
    assert.equal((await paymentRow(db, request.paymentId)).refund_status, null);
    assert.equal(ctx.fake.count("refunds.create"), 0);
  });

  test("anulowanie trzyma wiersz → akceptacja czeka i dostaje cancelled; jeden zwrot mentee_cancelled", async () => {
    const { ctx, mentor, request } = await setup();
    const held = await holdTransaction(db.pool, (tx) => cancelByTokenInTx(tx, request.token, {}));
    assert.equal(held.result.ok, true);
    const accept = acceptRequest(
      { mentorId: mentor.mentorId, requestId: request.id },
      { db: db.pool, payments: null, now: await beforeSlot(request.id) },
    );
    await waitUntilBlocked(db.pool, accept);
    await held.commit();
    const result = await accept;
    assert.equal(!result.ok && result.code, "cancelled");
    assert.equal((await row(request.id)).status, "cancelled");
    const payment = await paymentRow(db, request.paymentId);
    assert.equal(payment.refund_reason, "mentee_cancelled");
    assert.equal(payment.refund_status, "requested");
    assert.equal(ctx.fake.count("refunds.create"), 0);
  });

  test("odrzucenie trzyma wiersz → anulowanie czeka i dostaje already_refunding/declined; zwrot mentor_declined", async () => {
    const { ctx, mentor, request } = await setup();
    const held = await holdTransaction(db.pool, async (tx) =>
      decideInTx(tx, "decline", { mentorId: mentor.mentorId, requestId: request.id }, { now: await beforeSlot(request.id) }),
    );
    assert.equal(held.result.ok, true);
    const cancel = cancelByToken(request.token, { db: db.pool, payments: ctx.deps });
    await waitUntilBlocked(db.pool, cancel);
    await held.commit();
    assert.deepEqual(await cancel, { ok: false, reason: "already_refunding", status: "declined" });
    assert.equal((await row(request.id)).status, "declined");
    const payment = await paymentRow(db, request.paymentId);
    assert.equal(payment.refund_reason, "mentor_declined");
    assert.equal(payment.refund_status, "requested");
    const again = await cancelByToken(request.token, { db: db.pool, payments: ctx.deps });
    assert.equal(!again.ok && again.reason, "already_refunding");
    assert.ok(ctx.fake.count("refunds.create") <= 1);
    assert.equal((await paymentRow(db, request.paymentId)).refund_reason, "mentor_declined");
  });

  test("anulowanie trzyma wiersz → odrzucenie czeka i dostaje cancelled; zwrot mentee_cancelled", async () => {
    const { ctx, mentor, request } = await setup();
    const held = await holdTransaction(db.pool, (tx) => cancelByTokenInTx(tx, request.token, {}));
    assert.equal(held.result.ok, true);
    const decline = declineRequest(
      { mentorId: mentor.mentorId, requestId: request.id },
      { db: db.pool, payments: null, now: await beforeSlot(request.id) },
    );
    await waitUntilBlocked(db.pool, decline);
    await held.commit();
    const result = await decline;
    assert.equal(!result.ok && result.code, "cancelled");
    assert.equal((await row(request.id)).status, "cancelled");
    const payment = await paymentRow(db, request.paymentId);
    assert.equal(payment.refund_reason, "mentee_cancelled");
    assert.equal(payment.refund_status, "requested");
    const again = await cancelByToken(request.token, { db: db.pool, payments: ctx.deps });
    assert.equal(!again.ok && again.reason, "already_refunding");
    assert.ok(ctx.fake.count("refunds.create") <= 1);
  });

  test("wygaśnięcie trzyma wiersz → anulowanie czeka i dostaje already_refunding/lapsed; powód lapsed", async () => {
    const { ctx, request } = await setup();
    const now = await afterSlot(ctx, request.id);
    const held = await holdTransaction(db.pool, (tx) => lapseOneInTx(tx, { at: now(), stamp: now() }));
    assert.equal(held.result?.requestId, request.id);
    const cancel = cancelByToken(request.token, { db: db.pool, payments: ctx.deps });
    await waitUntilBlocked(db.pool, cancel);
    await held.commit();
    assert.deepEqual(await cancel, { ok: false, reason: "already_refunding", status: "lapsed" });
    assert.equal((await row(request.id)).status, "lapsed");
    const payment = await paymentRow(db, request.paymentId);
    assert.equal(payment.refund_reason, "lapsed");
    assert.equal(payment.refund_status, "requested");
    assert.equal(ctx.fake.count("refunds.create"), 0);
  });

  test("anulowanie trzyma wiersz → przebieg wygaśnięcia go pomija; po commicie cancelled, powód mentee_cancelled", async () => {
    const { ctx, request } = await setup();
    const now = await afterSlot(ctx, request.id);
    const held = await holdTransaction(db.pool, (tx) => cancelByTokenInTx(tx, request.token, { now, stamp: now() }));
    assert.equal(held.result.ok, true);
    // SKIP LOCKED: przebieg jest globalny dla schematu testowego, więc sprawdzamy wiersz tego zapytania.
    await lapseOverdue({ db: db.pool, payments: ctx.deps, now });
    assert.equal((await row(request.id)).status, "awaiting_mentor");
    await held.commit();
    await lapseOverdue({ db: db.pool, payments: ctx.deps, now });
    assert.equal((await row(request.id)).status, "cancelled");
    const payment = await paymentRow(db, request.paymentId);
    assert.equal(payment.refund_reason, "mentee_cancelled");
    assert.ok(ctx.fake.count("refunds.create") <= 1);
  });

  test("dwa równoległe anulowania (dwie karty): jedno ok, drugie already_refunding/cancelled; jeden zwrot", async () => {
    const { ctx, request } = await setup();
    const deps = { db: db.pool, payments: ctx.deps };
    const results = await Promise.all([cancelByToken(request.token, deps), cancelByToken(request.token, deps)]);
    assert.equal(results.filter((r) => r.ok).length, 1);
    const loser = results.find((r) => !r.ok);
    assert.deepEqual(loser, { ok: false, reason: "already_refunding", status: "cancelled" });
    assert.equal((await row(request.id)).status, "cancelled");
    const payment = await paymentRow(db, request.paymentId);
    assert.equal(payment.refund_reason, "mentee_cancelled");
    assert.equal(ctx.fake.count("refunds.create"), 1);
  });
});
