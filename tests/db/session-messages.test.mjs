// Czat sesji (spec #20 Implementation Plan krok 1): okno pisania z wstrzykniętym zegarem, izolacja stron
// (inny mentor, zły / wygasły token → nic), kursor i strony po 200, limit 500 także przy równoległych wpisach,
// wpis czekający na blokadę wiersza, CHECK-i tabeli.
import { test } from "node:test";
import assert from "node:assert/strict";
import { acceptRequest, declineRequest } from "../../lib/requests/decision.mjs";
import {
  listSessionMessages,
  MESSAGE_PAGE_SIZE,
  postMessageInTx,
  postSessionMessage,
  SESSION_MESSAGE_LIMIT,
} from "../../lib/sessions/messages.mjs";
import { apartSlots, makeRequestDeps, paidRequest, seedMentor } from "../requests/fixtures.mjs";
import { holdTransaction, waitUntilBlocked } from "../requests/race.mjs";
import { describeDb } from "./harness.mjs";

describeDb("czat sesji (#20 krok 1)", (db) => {
  /** Zaakceptowana sesja (prawdziwy przepływ #17 + #18 z fałszywym Stripe) i jej granice. */
  async function acceptedSession({ accept = true } = {}) {
    const ctx = makeRequestDeps(db);
    const mentor = await seedMentor(db);
    const [slot] = await apartSlots(db, mentor.mentorId, 1);
    const request = await paidRequest(db, ctx, mentor, slot);
    if (accept) {
      const outcome = await acceptRequest({ mentorId: mentor.mentorId, requestId: request.id }, { db: db.pool, payments: ctx.deps });
      assert.equal(outcome.ok, true);
    }
    const { rows } = await db.query("select slot_start, slot_end from requests where id = $1", [request.id]);
    const start = new Date(rows[0].slot_start);
    const end = new Date(rows[0].slot_end);
    const asMentee = { kind: /** @type {const} */ ("mentee"), token: request.token };
    const asMentor = { kind: /** @type {const} */ ("mentor"), mentorId: mentor.mentorId, requestId: request.id };
    return { ctx, mentor, request, start, end, asMentee, asMentor, during: new Date(start.getTime() + 60_000) };
  }
  const shift = (/** @type {Date} */ date, /** @type {number} */ ms) => new Date(date.getTime() + ms);

  test("okno pisania [start, koniec): przed → not_open, start i koniec−1 ms → zapis z tym czasem, koniec → closed", async () => {
    const s = await acceptedSession();
    assert.deepEqual(await postSessionMessage(db.pool, s.asMentee, "Dzień dobry", { at: shift(s.start, -1) }), { ok: false, code: "not_open" });
    const first = await postSessionMessage(db.pool, s.asMentee, "Dzień dobry", { at: s.start });
    assert.equal(first.ok, true);
    const last = await postSessionMessage(db.pool, s.asMentor, "Do zobaczenia", { at: shift(s.end, -1) });
    assert.equal(last.ok, true);
    assert.deepEqual(await postSessionMessage(db.pool, s.asMentor, "Za późno", { at: s.end }), { ok: false, code: "closed" });
    const { rows } = await db.query("select author, created_at from session_messages where request_id = $1 order by seq", [s.request.id]);
    assert.deepEqual(rows.map((r) => [r.author, new Date(r.created_at).getTime()]), [
      ["mentee", s.start.getTime()],
      ["mentor", s.end.getTime() - 1],
    ]);
  });

  test("odczyt: obie strony widzą swoje i cudze wiadomości (me/other), fazy before/open/ended z czasu serwera", async () => {
    const s = await acceptedSession();
    await postSessionMessage(db.pool, s.asMentee, "Mam błąd hydracji", { at: s.during });
    await postSessionMessage(db.pool, s.asMentor, "Pokaż stack trace", { at: shift(s.during, 1000) });

    const mentee = await listSessionMessages(db.pool, s.asMentee, { at: s.during });
    assert.equal(mentee?.phase, "open");
    assert.equal(mentee?.viewer, "mentee");
    assert.equal(mentee?.otherName, "Anna K.");
    assert.deepEqual(mentee?.messages.map((m) => [m.author, m.body]), [["me", "Mam błąd hydracji"], ["other", "Pokaż stack trace"]]);
    const mentor = await listSessionMessages(db.pool, s.asMentor, { at: s.during });
    assert.equal(mentor?.otherName, "Kuba");
    assert.deepEqual(mentor?.messages.map((m) => m.author), ["other", "me"]);

    assert.equal((await listSessionMessages(db.pool, s.asMentee, { at: shift(s.start, -1) }))?.phase, "before");
    const ended = await listSessionMessages(db.pool, s.asMentee, { at: s.end });
    assert.equal(ended?.phase, "ended");
    assert.equal(ended?.messages.length, 2, "po terminie czat zostaje do odczytu");
    assert.equal(ended?.opensAt, s.start.toISOString());
    assert.equal(ended?.closesAt, s.end.toISOString());
  });

  test("izolacja: inny mentor, zły token, wygasły token (30 dni po terminie) — nic do odczytu ani zapisu", async () => {
    const s = await acceptedSession();
    await postSessionMessage(db.pool, s.asMentee, "Prywatna treść sesji", { at: s.during });
    const other = await seedMentor(db);
    const intruder = { kind: /** @type {const} */ ("mentor"), mentorId: other.mentorId, requestId: s.request.id };
    assert.equal(await listSessionMessages(db.pool, intruder, { at: s.during }), null);
    assert.deepEqual(await postSessionMessage(db.pool, intruder, "Cześć", { at: s.during }), { ok: false, code: "not_found" });

    const badToken = { kind: /** @type {const} */ ("mentee"), token: "A".repeat(43) };
    assert.equal(await listSessionMessages(db.pool, badToken, { at: s.during }), null);
    assert.deepEqual(await postSessionMessage(db.pool, badToken, "Cześć", { at: s.during }), { ok: false, code: "not_found" });
    assert.equal(await listSessionMessages(db.pool, { kind: "mentee", token: "zły kształt" }, { at: s.during }), null);
    assert.equal(await listSessionMessages(db.pool, { ...s.asMentor, requestId: "nie-uuid" }, { at: s.during }), null);

    const expired = shift(s.end, 30 * 24 * 60 * 60 * 1000);
    assert.equal(await listSessionMessages(db.pool, s.asMentee, { at: expired }), null);
    assert.ok(await listSessionMessages(db.pool, s.asMentee, { at: shift(expired, -1) }));
  });

  test("bez czatu przed akceptacją i po odrzuceniu (not_found)", async () => {
    const waiting = await acceptedSession({ accept: false });
    assert.equal(await listSessionMessages(db.pool, waiting.asMentee, { at: waiting.during }), null);
    assert.deepEqual(await postSessionMessage(db.pool, waiting.asMentor, "Cześć", { at: waiting.during }), { ok: false, code: "not_found" });

    const declined = await acceptedSession({ accept: false });
    await declineRequest({ mentorId: declined.mentor.mentorId, requestId: declined.request.id }, { db: db.pool, payments: declined.ctx.deps });
    assert.equal(await listSessionMessages(db.pool, declined.asMentee, { at: declined.during }), null);
  });

  test("treść: pusta, same spacje, > 4000 znaków, nie-napis → invalid_body; 4000 znaków i wcięcia kodu zapisane bez zmian", async () => {
    const s = await acceptedSession();
    for (const body of ["", "   \n ", "x".repeat(4001), 42, null]) {
      assert.deepEqual(await postSessionMessage(db.pool, s.asMentee, body, { at: s.during }), { ok: false, code: "invalid_body" });
    }
    const code = "  const a = 1;\n    return a;\n";
    assert.equal((await postSessionMessage(db.pool, s.asMentee, code, { at: s.during })).ok, true);
    assert.equal((await postSessionMessage(db.pool, s.asMentee, "ż".repeat(4000), { at: s.during })).ok, true);
    const { rows } = await db.query("select body from session_messages where request_id = $1 order by seq limit 1", [s.request.id]);
    assert.equal(rows[0].body, code);
  });

  test("kursor: tylko nowsze niż `after`; 201 wiadomości w dwóch stronach bez luk", async () => {
    const s = await acceptedSession();
    await db.query(
      `insert into session_messages (request_id, author, body, created_at)
       select $1, case when i % 2 = 0 then 'mentor' else 'mentee' end, 'wiadomość ' || i, $2::timestamptz + i * interval '1 ms'
         from generate_series(1, 201) as i`,
      [s.request.id, s.during],
    );
    const first = await listSessionMessages(db.pool, s.asMentee, { at: s.during });
    assert.equal(first?.messages.length, MESSAGE_PAGE_SIZE);
    assert.equal(first?.hasMore, true);
    const second = await listSessionMessages(db.pool, s.asMentee, { at: s.during, after: first.messages.at(-1).seq });
    assert.equal(second?.messages.length, 1);
    assert.equal(second?.hasMore, false);
    const bodies = [...first.messages, ...second.messages].map((m) => m.body);
    assert.deepEqual(bodies, Array.from({ length: 201 }, (_, i) => `wiadomość ${i + 1}`));
    const none = await listSessionMessages(db.pool, s.asMentee, { at: s.during, after: second.messages[0].seq });
    assert.deepEqual(none?.messages, []);
  });

  test("limit 500: 501. odrzucona; przy 499 dwa równoległe wpisy → dokładnie jeden zapisany", async () => {
    const s = await acceptedSession();
    await db.query(
      `insert into session_messages (request_id, author, body, created_at)
       select $1, 'mentee', 'm' || i, $2 from generate_series(1, $3::int) as i`,
      [s.request.id, s.during, SESSION_MESSAGE_LIMIT - 1],
    );
    const results = await Promise.all([
      postSessionMessage(db.pool, s.asMentee, "ostatnia A", { at: s.during }),
      postSessionMessage(db.pool, s.asMentor, "ostatnia B", { at: s.during }),
    ]);
    assert.deepEqual(results.map((r) => r.ok).sort(), [false, true]);
    assert.deepEqual(results.find((r) => !r.ok), { ok: false, code: "limit_reached" });
    const { rows } = await db.query("select count(*)::int as n from session_messages where request_id = $1", [s.request.id]);
    assert.equal(rows[0].n, SESSION_MESSAGE_LIMIT);
    assert.equal((await listSessionMessages(db.pool, s.asMentee, { at: s.during }))?.limitReached, true);
  });

  test("blokada wiersza: drugi wpis czeka na pierwszy; kolejność seq = kolejność zatwierdzeń", async () => {
    const s = await acceptedSession();
    const held = await holdTransaction(db.pool, (tx) => postMessageInTx(tx, s.asMentee, "pierwsza", { at: s.during }));
    const second = postSessionMessage(db.pool, s.asMentor, "druga", { at: shift(s.during, 1) });
    await waitUntilBlocked(db.pool, second, held);
    await held.commit();
    assert.equal((await second).ok, true);
    const snapshot = await listSessionMessages(db.pool, s.asMentor, { at: s.during });
    assert.deepEqual(snapshot?.messages.map((m) => m.body), ["pierwsza", "druga"]);
    assert.ok(snapshot.messages[0].seq < snapshot.messages[1].seq);
  });

  test("CHECK-i: autor spoza ról i pusta treść odrzucone przez bazę", async () => {
    const s = await acceptedSession();
    await assert.rejects(db.query("insert into session_messages (request_id, author, body) values ($1, 'admin', 'x')", [s.request.id]), /session_messages_author_known/);
    await assert.rejects(db.query("insert into session_messages (request_id, author, body) values ($1, 'mentor', '  ')", [s.request.id]), /session_messages_body_length/);
  });
});
