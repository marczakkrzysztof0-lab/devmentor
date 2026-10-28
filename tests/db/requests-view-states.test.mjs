// Stany strony /r/{token} po decyzji mentora i po terminie (#18 krok 3): overdue, accepted, declined + zwrot,
// lapsed, cancelled — `getRequestByToken` z wstrzykiwanym zegarem.
import { test } from "node:test";
import assert from "node:assert/strict";
import { getRequestByToken } from "../../lib/requests/view.mjs";
import { apartSlots, makeRequestDeps, paidRequest, seedMentor } from "../requests/fixtures.mjs";
import { describeDb } from "./harness.mjs";

describeDb("strona /r/{token}: stany po decyzji i po terminie (#18)", (db) => {
  async function setup() {
    const ctx = makeRequestDeps(db);
    const mentor = await seedMentor(db);
    const [slot] = await apartSlots(db, mentor.mentorId, 1);
    const request = await paidRequest(db, ctx, mentor, slot);
    return { request, slotStart: new Date(slot.startsAt) };
  }
  const view = async (token, now = new Date()) => {
    const page = await getRequestByToken(db.pool, token, now);
    return { status: page?.status, refundStatus: page?.refundStatus };
  };

  test("awaiting_mentor: przed terminem czeka; od slot_start — overdue bez zwrotu", async () => {
    const { request, slotStart } = await setup();
    assert.deepEqual(await view(request.token, new Date(slotStart.getTime() - 60_000)), { status: "awaiting_mentor", refundStatus: null });
    assert.deepEqual(await view(request.token, new Date(slotStart.getTime() + 60_000)), { status: "overdue", refundStatus: null });
  });

  test("accepted: stan zaakceptowany niezależnie od zegara", async () => {
    const { request } = await setup();
    await db.query("update requests set status = 'accepted', accepted_at = now() where id = $1", [request.id]);
    assert.deepEqual(await view(request.token), { status: "accepted", refundStatus: null });
  });

  test("declined: zwrot requested → succeeded", async () => {
    const { request } = await setup();
    await db.query("update requests set status = 'declined', declined_at = now() where id = $1", [request.id]);
    await db.query(
      "update payments set refund_status = 'requested', refund_reason = 'mentor_declined', refund_requested_at = now(), refund_next_attempt_at = now() where id = $1",
      [request.paymentId],
    );
    assert.deepEqual(await view(request.token), { status: "declined", refundStatus: "requested" });
    await db.query("update payments set refund_status = 'succeeded', refunded_at = now() where id = $1", [request.paymentId]);
    assert.deepEqual(await view(request.token), { status: "declined", refundStatus: "succeeded" });
  });

  test("lapsed bez zleconego zwrotu: refundStatus null", async () => {
    const { request } = await setup();
    await db.query("update requests set status = 'lapsed', lapsed_at = now() where id = $1", [request.id]);
    assert.deepEqual(await view(request.token), { status: "lapsed", refundStatus: null });
  });

  test("cancelled: stan anulowany", async () => {
    const { request } = await setup();
    await db.query("update requests set status = 'cancelled', cancelled_at = now() where id = $1", [request.id]);
    assert.deepEqual(await view(request.token), { status: "cancelled", refundStatus: null });
  });
});
