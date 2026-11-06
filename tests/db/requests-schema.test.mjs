// Zapytania opłacone z góry i outbox e-maili: ograniczenia schematu (spec #17, Data Model; migracja 0006).
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { describeDb } from "./harness.mjs";

const unique = () => randomBytes(6).toString("hex");

// Oczekuje błędu PostgreSQL o danym kodzie (i opcjonalnie nazwie ograniczenia).
async function assertPgError(promise, code, constraint) {
  await assert.rejects(promise, (error) => {
    assert.equal(error.code, code, error.message);
    if (constraint) assert.equal(error.constraint, constraint, error.message);
    return true;
  });
}

async function createMentor(db) {
  const { rows } = await db.query("insert into mentors (email) values ($1) returning *", [`mentor-${unique()}@example.com`]);
  return rows[0];
}

async function createPayment(db) {
  const { rows } = await db.query(
    `insert into payments (status, amount_minor, currency, commission_bps, checkout_expires_at)
     values ('pending', 15000, 'PLN', 1000, now() + interval '33 min') returning *`,
  );
  return rows[0];
}

const SLOT_START = new Date("2030-01-15T10:00:00Z");
const QUESTION = "Jak zorganizować testy integracyjne w Node?";

// Wstawia zapytanie z poprawnymi wartościami domyślnymi (nowy mentor i płatność, o ile nie podano).
async function insertRequest(db, overrides = {}) {
  const mentorId = overrides.mentor_id ?? (await createMentor(db)).id;
  const paymentId = overrides.payment_id ?? (await createPayment(db)).id;
  const length = overrides.length_minutes ?? 25;
  const row = {
    mentor_id: mentorId,
    payment_id: paymentId,
    length_minutes: length,
    slot_start: SLOT_START,
    slot_end: new Date(SLOT_START.getTime() + length * 60_000),
    mentee_name: "Anna",
    question: QUESTION,
    access_token_hash: unique() + unique(),
    submission_id: randomUUID(),
    ...overrides,
  };
  const columns = Object.keys(row);
  const { rows } = await db.query(
    `insert into requests (${columns.join(", ")})
     values (${columns.map((_, i) => `$${i + 1}`).join(", ")}) returning *`,
    columns.map((column) => row[column]),
  );
  return rows[0];
}

async function insertEmail(db, overrides = {}) {
  const row = { to_address: "jan@example.com", template: "request_confirmation", ...overrides };
  const columns = Object.keys(row);
  const { rows } = await db.query(
    `insert into outbound_emails (${columns.join(", ")})
     values (${columns.map((_, i) => `$${i + 1}`).join(", ")}) returning *`,
    columns.map((column) => row[column]),
  );
  return rows[0];
}

describeDb("schemat 0006: requests", (db) => {
  test("poprawne zapytanie ma status awaiting_payment i nie ma paid_at", async () => {
    const request = await insertRequest(db);
    assert.equal(request.status, "awaiting_payment");
    assert.equal(request.paid_at, null);
  });

  test("długość sesji 30 minut jest odrzucana (R01: tylko 25 i 50)", async () => {
    await assertPgError(
      insertRequest(db, { length_minutes: 30, slot_end: new Date(SLOT_START.getTime() + 30 * 60_000) }),
      "23514",
      "requests_length_known",
    );
    await insertRequest(db, { length_minutes: 50 });
  });

  test("slot_end niezgodny z slot_start + długość jest odrzucany", async () => {
    await assertPgError(
      insertRequest(db, { length_minutes: 25, slot_end: new Date(SLOT_START.getTime() + 50 * 60_000) }),
      "23514",
      "requests_slot_end_matches",
    );
  });

  test("pytanie puste albo krótsze niż 20 znaków po obcięciu jest odrzucane", async () => {
    for (const question of ["", "   ", "a".repeat(19), `   ${"a".repeat(19)}   `]) {
      await assertPgError(insertRequest(db, { question }), "23514", "requests_question_length");
    }
  });

  test("pytanie: 20 znaków (także z dopełnieniem spacjami) i 4000 znaków przyjęte, 4001 odrzucone", async () => {
    await insertRequest(db, { question: "a".repeat(20) });
    await insertRequest(db, { question: `  ${"a".repeat(20)}  ` });
    await insertRequest(db, { question: "a".repeat(4000) });
    await assertPgError(insertRequest(db, { question: "a".repeat(4001) }), "23514", "requests_question_length");
  });

  test("imię jednoznakowe jest odrzucane, dwuznakowe przyjęte", async () => {
    await assertPgError(insertRequest(db, { mentee_name: "A" }), "23514", "requests_mentee_name_length");
    await assertPgError(insertRequest(db, { mentee_name: " A " }), "23514", "requests_mentee_name_length");
    await insertRequest(db, { mentee_name: "Al" });
  });

  test("jedno zapytanie na płatność: drugi payment_id jest odrzucany", async () => {
    const payment = await createPayment(db);
    await insertRequest(db, { payment_id: payment.id });
    await assertPgError(insertRequest(db, { payment_id: payment.id }), "23505", "requests_payment_id_key");
  });

  test("submission_id i access_token_hash są unikalne", async () => {
    const first = await insertRequest(db);
    await assertPgError(insertRequest(db, { submission_id: first.submission_id }), "23505", "requests_submission_id_key");
    await assertPgError(insertRequest(db, { access_token_hash: first.access_token_hash }), "23505", "requests_access_token_hash_key");
  });

  test("nieznany status zapytania jest odrzucany", async () => {
    await assertPgError(insertRequest(db, { status: "nowy", paid_at: new Date() }), "23514", "requests_status_known");
  });

  test("status awaiting_mentor bez paid_at jest odrzucany, z paid_at przyjęty", async () => {
    await assertPgError(insertRequest(db, { status: "awaiting_mentor" }), "23514", "requests_paid_has_time");
    await insertRequest(db, { status: "awaiting_mentor", paid_at: new Date() });
  });

  test("stany bez opłacenia (awaiting_payment, payment_failed) nie wymagają paid_at", async () => {
    await insertRequest(db, { status: "payment_failed" });
  });

  test("nieistniejący mentor albo płatność łamie klucz obcy", async () => {
    await assertPgError(insertRequest(db, { mentor_id: randomUUID() }), "23503", "requests_mentor_id_fkey");
    await assertPgError(insertRequest(db, { payment_id: randomUUID() }), "23503", "requests_payment_id_fkey");
  });

  test("mentora z zapytaniem nie da się usunąć (ON DELETE RESTRICT)", async () => {
    const request = await insertRequest(db);
    await assertPgError(db.query("delete from mentors where id = $1", [request.mentor_id]), "23503", "requests_mentor_id_fkey");
  });
});

describeDb("schemat 0006: outbound_emails", (db) => {
  test("e-mail domyślnie ma status due i zero prób", async () => {
    const email = await insertEmail(db);
    assert.equal(email.status, "due");
    assert.equal(email.attempts, 0);
  });

  test("nie-szkic bez adresata jest odrzucany; szkic bez adresata przyjęty", async () => {
    for (const status of ["due", "failed"]) {
      await assertPgError(insertEmail(db, { to_address: null, status }), "23514", "outbound_emails_recipient_unless_draft");
    }
    const draft = await insertEmail(db, { to_address: null, status: "draft" });
    assert.equal(draft.to_address, null);
  });

  test("status sent bez sent_at jest odrzucany (i sent_at bez statusu sent)", async () => {
    await assertPgError(insertEmail(db, { status: "sent", params: null }), "23514", "outbound_emails_sent_has_time");
    await assertPgError(insertEmail(db, { status: "due", sent_at: new Date() }), "23514", "outbound_emails_sent_has_time");
    const sent = await insertEmail(db, { status: "sent", sent_at: new Date(), params: null });
    assert.equal(sent.params, null);
  });

  test("sent albo failed z niepustymi parametrami jest odrzucany (parametry zerowane po wysyłce)", async () => {
    const params = JSON.stringify({ requestUrl: "https://devmentor.example/r/TOKEN_PLACEHOLDER" });
    await assertPgError(
      insertEmail(db, { status: "sent", sent_at: new Date(), params }),
      "23514",
      "outbound_emails_params_cleared",
    );
    await assertPgError(insertEmail(db, { status: "failed", params }), "23514", "outbound_emails_params_cleared");
  });

  test("due i draft mogą mieć parametry", async () => {
    const params = JSON.stringify({ amount: "150,00 PLN" });
    const due = await insertEmail(db, { params });
    assert.deepEqual(due.params, { amount: "150,00 PLN" });
    await insertEmail(db, { status: "draft", to_address: null, params });
  });

  test("nieznany status e-maila i ujemna liczba prób są odrzucane", async () => {
    await assertPgError(insertEmail(db, { status: "queued" }), "23514", "outbound_emails_status_known");
    await assertPgError(insertEmail(db, { attempts: -1 }), "23514", "outbound_emails_attempts_non_negative");
  });
});
