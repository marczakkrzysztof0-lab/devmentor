// Zapytania mentora: lista, licznik, szczegóły (spec #18, krok 2) — izolacja po mentor_id, wykluczenia, overdue, 30 dni.
import { test } from "node:test";
import assert from "node:assert/strict";
import { syncCheckout } from "../../lib/payments/payments.mjs";
import { countAwaitingDecision, getMentorRequest, listMentorRequests } from "../../lib/requests/mentor.mjs";
import { startRequest } from "../../lib/requests/start.mjs";
import { formInput, makeRequestDeps, openSlots, QUESTION, seedMentor } from "../requests/fixtures.mjs";
import { describeDb } from "./harness.mjs";

/** Terminy mentora, które na siebie nie nachodzą (kolejne wolne okna mogą się częściowo pokrywać). */
async function apartSlots(db, mentorId, count) {
  const slots = [];
  for (const slot of await openSlots(db, mentorId)) {
    if (slots.every((taken) => Math.abs(new Date(slot.startsAt) - new Date(taken.startsAt)) >= 2 * 60 * 60 * 1000)) slots.push(slot);
  }
  assert.ok(slots.length >= count);
  return slots;
}

const DAY = 24 * 60 * 60 * 1000;
const TIME_COLUMN = { accepted: "accepted_at", declined: "declined_at", lapsed: "lapsed_at", cancelled: "cancelled_at" };

describeDb("zapytania mentora (#18 krok 2)", (db) => {
  /** Zapytanie rozpoczęte na termin; opłacone (awaiting_mentor), gdy `pay`. */
  async function makeRequest(ctx, mentor, slot, { pay = true } = {}) {
    const result = await startRequest(formInput({ slug: mentor.slug, slot }), ctx.startDeps);
    assert.equal(result.ok, true, JSON.stringify(result));
    const { rows } = await db.query(
      "select r.*, p.stripe_checkout_session_id as session_id from requests r join payments p on p.id = r.payment_id where r.mentor_id = $1 and r.slot_start = $2",
      [mentor.mentorId, slot.startsAt],
    );
    const request = rows[0];
    if (pay) {
      ctx.fake.completeSession(request.session_id, { email: "kuba-dev@example.com" });
      await syncCheckout(request.payment_id, request.session_id, ctx.deps);
    }
    return request.id;
  }

  /** Ustawia stan końcowy z chwilą decyzji `at` (SQL, np. "now() - interval '31 days'"). */
  const finish = (id, status, at = "now()") => db.query(`update requests set status = $2, ${TIME_COLUMN[status]} = ${at} where id = $1`, [id, status]);

  test("lista pomija awaiting_payment i payment_failed, pokazuje awaiting_mentor bez e-maila płacącego i pytania", async () => {
    const ctx = makeRequestDeps(db);
    const mentor = await seedMentor(db);
    const [s1, s2, s3] = await apartSlots(db, mentor.mentorId, 6);
    const paid = await makeRequest(ctx, mentor, s1);
    const unpaid = await makeRequest(ctx, mentor, s2, { pay: false });
    const failed = await makeRequest(ctx, mentor, s3, { pay: false });
    await db.query("update requests set status = 'payment_failed' where id = $1", [failed]);

    const list = await listMentorRequests(db, { mentorId: mentor.mentorId, now: new Date() });
    assert.deepEqual(list.map((item) => item.id), [paid]);
    assert.equal(list[0].status, "awaiting_mentor");
    assert.equal(list[0].menteeName, "Kuba");
    assert.equal(list[0].lengthMinutes, 25);
    assert.equal(list[0].slotStart, new Date(s1.startsAt).toISOString());
    assert.ok(!JSON.stringify(list).includes("kuba-dev@example.com"));
    assert.ok(!JSON.stringify(list).includes(QUESTION.slice(0, 15)));
    assert.equal(await getMentorRequest(db, { mentorId: mentor.mentorId, requestId: unpaid, now: new Date() }), null);
    assert.equal(await getMentorRequest(db, { mentorId: mentor.mentorId, requestId: failed, now: new Date() }), null);
  });

  test("izolacja: mentor B nie widzi zapytań mentora A w żadnym stanie (lista, licznik, szczegóły)", async () => {
    const ctx = makeRequestDeps(db);
    const a = await seedMentor(db);
    const b = await seedMentor(db);
    const slots = await apartSlots(db, a.mentorId, 6);
    const ids = {};
    for (const [i, status] of ["awaiting_mentor", "accepted", "declined", "lapsed", "cancelled"].entries()) {
      ids[status] = await makeRequest(ctx, a, slots[i]);
      if (status !== "awaiting_mentor") await finish(ids[status], status);
    }
    const now = new Date();
    assert.equal((await listMentorRequests(db, { mentorId: a.mentorId, now })).length, 5);
    assert.deepEqual(await listMentorRequests(db, { mentorId: b.mentorId, now }), []);
    assert.equal(await countAwaitingDecision(db, { mentorId: a.mentorId, now }), 1);
    assert.equal(await countAwaitingDecision(db, { mentorId: b.mentorId, now }), 0);
    for (const [status, id] of Object.entries(ids)) {
      assert.equal(await getMentorRequest(db, { mentorId: b.mentorId, requestId: id, now }), null, status);
      assert.equal((await getMentorRequest(db, { mentorId: a.mentorId, requestId: id, now }))?.status, status);
    }
  });

  test("po starcie terminu awaiting_mentor jest „overdue” i nie liczy się do plakietki", async () => {
    const ctx = makeRequestDeps(db);
    const mentor = await seedMentor(db);
    const [slot] = await apartSlots(db, mentor.mentorId, 6);
    const id = await makeRequest(ctx, mentor, slot);
    const before = new Date();
    const after = new Date(new Date(slot.startsAt).getTime() + 60 * 1000);

    assert.equal((await listMentorRequests(db, { mentorId: mentor.mentorId, now: before }))[0].status, "awaiting_mentor");
    assert.equal(await countAwaitingDecision(db, { mentorId: mentor.mentorId, now: before }), 1);
    const [overdue] = await listMentorRequests(db, { mentorId: mentor.mentorId, now: after });
    assert.equal(overdue.status, "overdue");
    assert.equal((await getMentorRequest(db, { mentorId: mentor.mentorId, requestId: id, now: after })).status, "overdue");
    assert.equal(await countAwaitingDecision(db, { mentorId: mentor.mentorId, now: after }), 0);
  });

  test("licznik liczy tylko awaiting_mentor z terminem w przyszłości", async () => {
    const ctx = makeRequestDeps(db);
    const mentor = await seedMentor(db);
    const [s1, s2, s3, s4] = await apartSlots(db, mentor.mentorId, 6);
    await makeRequest(ctx, mentor, s1);
    await makeRequest(ctx, mentor, s2);
    await finish(await makeRequest(ctx, mentor, s3), "accepted");
    await makeRequest(ctx, mentor, s4, { pay: false });
    assert.equal(await countAwaitingDecision(db, { mentorId: mentor.mentorId, now: new Date() }), 2);
  });

  test("zakończone starsze niż 30 dni znikają z listy; świeże zostają; zaakceptowane do 30 dni po końcu sesji", async () => {
    const ctx = makeRequestDeps(db);
    const mentor = await seedMentor(db);
    const [s1, s2, s3] = await apartSlots(db, mentor.mentorId, 6);
    await finish(await makeRequest(ctx, mentor, s1), "declined", "now() - interval '31 days'");
    const freshDeclined = await makeRequest(ctx, mentor, s2);
    await finish(freshDeclined, "declined", "now() - interval '29 days'");
    const accepted = await makeRequest(ctx, mentor, s3);
    await finish(accepted, "accepted");

    const ids = (await listMentorRequests(db, { mentorId: mentor.mentorId, now: new Date() })).map((item) => item.id);
    assert.deepEqual(ids.sort(), [freshDeclined, accepted].sort());
    // Sesja zaakceptowanego skończyła się ponad 30 dni temu → poza listą.
    const later = new Date(new Date(s3.endsAt ?? s3.startsAt).getTime() + 31 * DAY);
    assert.ok(!(await listMentorRequests(db, { mentorId: mentor.mentorId, now: later })).some((item) => item.id === accepted));
  });

  test("getMentorRequest: zły kształt id → null bez błędu bazy; szczegóły z pytaniem i kwotą, bez e-maila płacącego", async () => {
    const ctx = makeRequestDeps(db);
    const mentor = await seedMentor(db);
    const [slot] = await apartSlots(db, mentor.mentorId, 6);
    const id = await makeRequest(ctx, mentor, slot);
    const now = new Date();
    for (const bad of ["nie-uuid", "", "1; drop table requests", undefined, null, 42, "00000000-0000-0000-0000-00000000000"]) {
      assert.equal(await getMentorRequest(db, { mentorId: mentor.mentorId, requestId: bad, now }), null);
    }
    assert.equal(await getMentorRequest(db, { mentorId: mentor.mentorId, requestId: "00000000-0000-4000-8000-000000000000", now }), null);

    const detail = await getMentorRequest(db, { mentorId: mentor.mentorId, requestId: id, now });
    assert.equal(detail.id, id);
    assert.equal(detail.question, QUESTION);
    assert.equal(detail.amountMinor, 15000);
    assert.equal(detail.currency, "PLN");
    assert.equal(detail.refundStatus, null);
    assert.equal(detail.status, "awaiting_mentor");
    assert.ok(!JSON.stringify(detail).includes("kuba-dev@example.com"));
    assert.ok(!Object.keys(detail).some((key) => /email/i.test(key)));
  });
});
