// Rozliczenie sesji (spec #21 Implementation Plan krok 1–2; R09, R15, D11): reguła, cztery kryteria akceptacji
// z wstrzykniętym zegarem i fałszywym Stripe, wiadomość spoza terminu, idempotencja, dwa równoległe przebiegi,
// wiersz trzymany przez zapis wiadomości, awaria Stripe → ponowienie, migracja 0008 (CHECK, down).
import { test } from "node:test";
import assert from "node:assert/strict";
import { acceptRequest } from "../../lib/requests/decision.mjs";
import { getMentorRequest, listMentorRequests } from "../../lib/requests/mentor.mjs";
import { getRequestByToken } from "../../lib/requests/view.mjs";
import { JOB_NAMES } from "../../lib/jobs/registry.mjs";
import { retryRefunds } from "../../lib/payments/refunds.mjs";
import { postMessageInTx, postSessionMessage } from "../../lib/sessions/messages.mjs";
import { settleEnded, settlementOutcome } from "../../lib/sessions/settle.mjs";
import { timeoutError } from "../payments/fake-stripe.mjs";
import { paymentRow } from "../payments/helpers.mjs";
import { apartSlots, makeRequestDeps, paidRequest, QUESTION, seedMentor } from "../requests/fixtures.mjs";
import { holdTransaction, waitUntilBlocked } from "../requests/race.mjs";
import { describeDb } from "./harness.mjs";

describeDb("rozliczenie sesji (#21)", (db) => {
  /** `count` zaakceptowanych sesji jednego mentora, każda z płatnikiem `kuba-<mentor>-<i>@example.com`. */
  async function sessions(count = 1) {
    const ctx = makeRequestDeps(db);
    const mentor = await seedMentor(db);
    const slots = await apartSlots(db, mentor.mentorId, count);
    const list = [];
    for (const [i, slot] of slots.entries()) {
      const payer = `kuba-${mentor.mentorId}-${i}@example.com`;
      const request = await paidRequest(db, ctx, mentor, slot, { email: payer });
      const accepted = await acceptRequest({ mentorId: mentor.mentorId, requestId: request.id }, { db: db.pool, payments: ctx.deps });
      assert.equal(accepted.ok, true);
      const { rows } = await db.query("select slot_start, slot_end from requests where id = $1", [request.id]);
      list.push({
        ...request,
        payer,
        start: new Date(rows[0].slot_start),
        end: new Date(rows[0].slot_end),
        asMentee: { kind: /** @type {const} */ ("mentee"), token: request.token },
        asMentor: { kind: /** @type {const} */ ("mentor"), mentorId: mentor.mentorId, requestId: request.id },
      });
    }
    return { ctx, mentor, list };
  }
  const during = (s, minutes = 1) => new Date(s.start.getTime() + minutes * 60_000);
  /** Zegar „po ostatnim terminie” dla zadania i dla płatności (znaczniki zwrotu). */
  function afterAll(ctx, list) {
    const later = new Date(Math.max(...list.map((s) => s.end.getTime())) + 60_000);
    ctx.clock.now = later;
    return () => new Date(later);
  }
  const row = async (id) => (await db.query("select * from requests where id = $1", [id])).rows[0];
  const emails = async (to) => (await db.query("select template, params from outbound_emails where to_address = $1 and template like 'session_%'", [to])).rows;
  const job = (ctx, now) => settleEnded({ db: db.pool, payments: ctx.deps, now });

  test("reguła R15 + D11: cztery przypadki", () => {
    assert.equal(settlementOutcome({ mentorPosted: false, menteePosted: true }), "mentor_no_show");
    assert.equal(settlementOutcome({ mentorPosted: true, menteePosted: false }), "mentee_no_show");
    assert.equal(settlementOutcome({ mentorPosted: false, menteePosted: false }), "mentor_no_show");
    assert.equal(settlementOutcome({ mentorPosted: true, menteePosted: true }), "held");
  });

  test("zadanie w rejestrze: po wygasaniu zapytań, przed ponowieniami zwrotów i e-mailami", () => {
    const at = (name) => JOB_NAMES.indexOf(name);
    assert.ok(at("sessions.settleEnded") > at("requests.lapseOverdue"));
    assert.ok(at("sessions.settleEnded") < at("payments.retryRefunds"));
    assert.ok(at("sessions.settleEnded") < at("email.sendDue"));
  });

  test("AC1–AC4: tylko deweloper → zwrot; tylko mentor → płatność zostaje; nikt → zwrot (D11); obie strony → odbyta", async () => {
    const { ctx, list } = await sessions(4);
    const [devOnly, mentorOnly, nobody, both] = list;
    await postSessionMessage(db.pool, devOnly.asMentee, "Jestem, czekam", { at: during(devOnly) });
    await postSessionMessage(db.pool, mentorOnly.asMentor, "Jestem, czekam", { at: during(mentorOnly) });
    await postSessionMessage(db.pool, both.asMentee, "Dzień dobry", { at: during(both) });
    await postSessionMessage(db.pool, both.asMentor, "Dzień dobry", { at: during(both, 2) });

    // Przed końcem terminów nic się nie rozlicza.
    assert.equal((await settleEnded({ db: db.pool, payments: ctx.deps, now: () => during(devOnly) })).settled, 0);

    const counts = await job(ctx, afterAll(ctx, list));
    assert.ok(counts.settled >= 4);

    assert.equal((await row(devOnly.id)).status, "mentor_no_show");
    assert.ok((await row(devOnly.id)).settled_at);
    const refunded = await paymentRow(db, devOnly.paymentId);
    assert.equal(refunded.refund_reason, "mentor_no_show");
    assert.equal(refunded.refund_status, "succeeded", "zwrot wykonany w tym samym przebiegu (tego samego dnia)");
    assert.deepEqual((await emails(devOnly.payer)).map((e) => e.template), ["session_mentor_no_show"]);

    assert.equal((await row(mentorOnly.id)).status, "mentee_no_show");
    assert.equal((await paymentRow(db, mentorOnly.paymentId)).refund_status, null);
    assert.deepEqual((await emails(mentorOnly.payer)).map((e) => e.template), ["session_mentee_no_show"]);

    assert.equal((await row(nobody.id)).status, "mentor_no_show");
    assert.equal((await paymentRow(db, nobody.paymentId)).refund_status, "succeeded");

    assert.equal((await row(both.id)).status, "held");
    assert.equal((await paymentRow(db, both.paymentId)).refund_status, null);
    assert.deepEqual(await emails(both.payer), [], "bez e-maila przy sesji odbytej");

    assert.equal(ctx.fake.count("refunds.create"), 2);
    for (const { params } of [...(await emails(devOnly.payer)), ...(await emails(mentorOnly.payer))]) {
      assert.ok(!JSON.stringify(params).includes(QUESTION.slice(0, 15)), "bez treści pytania");
      assert.ok(!JSON.stringify(params).includes("czekam"), "bez treści czatu");
    }
  });

  test("wiadomość spoza terminu się nie liczy; drugi przebieg nic nie zmienia", async () => {
    const { ctx, list } = await sessions(1);
    const [s] = list;
    await postSessionMessage(db.pool, s.asMentee, "Jestem", { at: during(s) });
    // Wpis mentora z czasem po terminie (np. ręcznie) nie zmienia wyniku.
    await db.query("insert into session_messages (request_id, author, body, created_at) values ($1, 'mentor', 'za późno', $2)", [s.id, s.end]);
    const now = afterAll(ctx, list);
    await job(ctx, now);
    await job(ctx, now);
    assert.equal((await row(s.id)).status, "mentor_no_show");
    assert.equal(ctx.fake.count("refunds.create"), 1);
    assert.equal((await emails(s.payer)).length, 1);
  });

  test("dwa równoległe przebiegi rozliczają każdą sesję raz, jeden zwrot na płatność", async () => {
    const { ctx, mentor, list } = await sessions(3);
    const now = afterAll(ctx, list);
    await Promise.all([job(ctx, now), job(ctx, now)]);
    const { rows } = await db.query("select status from requests where mentor_id = $1", [mentor.mentorId]);
    assert.deepEqual(rows.map((r) => r.status), ["mentor_no_show", "mentor_no_show", "mentor_no_show"]);
    assert.equal(ctx.fake.count("refunds.create"), 3);
    for (const s of list) assert.equal((await emails(s.payer)).length, 1);
  });

  test("wiersz trzymany przez zapis wiadomości jest pomijany; kolejny przebieg liczy tę wiadomość", async () => {
    const { ctx, list } = await sessions(1);
    const [s] = list;
    await postSessionMessage(db.pool, s.asMentee, "Jestem", { at: during(s) });
    const held = await holdTransaction(db.pool, (tx) => postMessageInTx(tx, s.asMentor, "Też jestem", { at: new Date(s.end.getTime() - 1) }));
    const now = afterAll(ctx, list);
    await job(ctx, now);
    assert.equal((await row(s.id)).status, "accepted", "pominięty, nie rozliczony bez wiadomości mentora");
    await held.commit();
    await job(ctx, now);
    assert.equal((await row(s.id)).status, "held");
    assert.equal(ctx.fake.count("refunds.create"), 0);
  });

  test("rozliczenie trzyma wiersz → zapis wiadomości czeka i dostaje closed", async () => {
    const { ctx, list } = await sessions(1);
    const [s] = list;
    const now = afterAll(ctx, list);
    const { settleOneInTx } = await import("../../lib/sessions/settle.mjs");
    const held = await holdTransaction(db.pool, (tx) => settleOneInTx(tx, { at: now(), stamp: now() }));
    const late = postSessionMessage(db.pool, s.asMentor, "Jestem!", { at: new Date(s.end.getTime() - 1) });
    await waitUntilBlocked(db.pool, late, held);
    await held.commit();
    assert.deepEqual(await late, { ok: false, code: "closed" });
    assert.equal((await row(s.id)).status, "mentor_no_show");
  });

  test("Stripe nie działa: wynik zapisany, zwrot `requested`, ponowienie retryRefunds go wykonuje", async () => {
    const { ctx, list } = await sessions(1);
    const [s] = list;
    const now = afterAll(ctx, list);
    ctx.fake.fail("refunds.create", timeoutError);
    await job(ctx, now);
    assert.equal((await row(s.id)).status, "mentor_no_show");
    assert.equal((await paymentRow(db, s.paymentId)).refund_status, "requested");
    ctx.clock.now = new Date(now().getTime() + 2 * 60_000);
    await retryRefunds(ctx.deps);
    assert.equal((await paymentRow(db, s.paymentId)).refund_status, "succeeded");
  });

  test("0008: CHECK `settled_has_time`; status spoza listy odrzucony", async () => {
    const { list } = await sessions(1);
    const [s] = list;
    await assert.rejects(db.query("update requests set status = 'held' where id = $1", [s.id]), /requests_settled_has_time/);
    await assert.rejects(db.query("update requests set settled_at = now() where id = $1", [s.id]), /requests_settled_has_time/);
    await assert.rejects(db.query("update requests set status = 'no_show' where id = $1", [s.id]), /requests_status_known/);
  });

  test("0008 down odmawia, gdy są rozliczone sesje: wyniki, settled_at i historia migracji nietknięte (review PR #52)", async () => {
    const { ctx, list } = await sessions(1);
    const [s] = list;
    await job(ctx, afterAll(ctx, list));
    const before = await row(s.id);
    assert.equal(before.status, "mentor_no_show");
    await assert.rejects(db.migrate("down", 1), /istnieją rozliczone sesje/);
    const after = await row(s.id);
    assert.equal(after.status, "mentor_no_show");
    assert.equal(new Date(after.settled_at).getTime(), new Date(before.settled_at).getTime());
    const { rows } = await db.query("select name from pgmigrations order by run_on desc, id desc limit 1");
    assert.equal(rows[0].name, "0008_session_outcomes");
  });

  test("widoki: przed rozliczeniem „session_ended” (mentor i /r/), po — wynik; lista mentora pokazuje rozliczone", async () => {
    const { ctx, mentor, list } = await sessions(1);
    const [s] = list;
    const now = afterAll(ctx, list);
    assert.equal((await getRequestByToken(db.pool, s.token, now())).status, "session_ended");
    assert.equal((await getMentorRequest(db.pool, { mentorId: mentor.mentorId, requestId: s.id, now: now() })).status, "session_ended");
    await job(ctx, now);
    const page = await getRequestByToken(db.pool, s.token, now());
    assert.equal(page.status, "mentor_no_show");
    assert.equal(page.refundStatus, "succeeded");
    const items = await listMentorRequests(db.pool, { mentorId: mentor.mentorId, now: now() });
    assert.deepEqual(items.map((i) => i.status), ["mentor_no_show"]);
    const muchLater = new Date(now().getTime() + 31 * 24 * 60 * 60 * 1000);
    assert.deepEqual(await listMentorRequests(db.pool, { mentorId: mentor.mentorId, now: muchLater }), [], "po 30 dniach od rozliczenia znika z listy");
  });
});
