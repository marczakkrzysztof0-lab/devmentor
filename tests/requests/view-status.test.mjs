// viewStatus — czysta funkcja stanu strony /r/{token} (#17, #18): termin minął i mapowanie reszty.
import { test } from "node:test";
import assert from "node:assert/strict";
import { viewStatus } from "../../lib/requests/view.mjs";

const now = new Date("2026-11-01T12:00:00Z");
const slot = (offsetMinutes) => new Date(now.getTime() + offsetMinutes * 60_000);

test("awaiting_mentor: przed terminem czeka na mentora, od slot_start (włącznie) — termin minął", () => {
  assert.equal(viewStatus({ status: "awaiting_mentor", paymentStatus: "succeeded", slotStart: slot(1), now }), "awaiting_mentor");
  assert.equal(viewStatus({ status: "awaiting_mentor", paymentStatus: "succeeded", slotStart: slot(0), now }), "overdue");
  assert.equal(viewStatus({ status: "awaiting_mentor", paymentStatus: "succeeded", slotStart: slot(-1), now }), "overdue");
  assert.equal(viewStatus({ status: "awaiting_mentor", paymentStatus: "succeeded", slotStart: slot(-1).toISOString(), now }), "overdue");
});

test("pozostałe stany: mapowanie bez zmian, termin nie ma znaczenia", () => {
  const view = (status, paymentStatus = "succeeded") => viewStatus({ status, paymentStatus, slotStart: slot(-60), now });
  assert.equal(view("awaiting_payment", "pending"), "payment_pending");
  assert.equal(view("awaiting_payment", "expired"), "payment_failed");
  assert.equal(view("payment_failed", "expired"), "payment_failed");
  assert.equal(view("payment_failed", "succeeded"), "late_payment");
  for (const status of ["accepted", "declined", "lapsed", "cancelled"]) assert.equal(view(status), status);
});

test("#21: accepted po końcu terminu → session_ended; wyniki sesji bez zmian", () => {
  const now = new Date("2026-10-28T12:00:00Z");
  const at = (minutes) => new Date(now.getTime() + minutes * 60_000);
  const view = (status, slotEnd) => viewStatus({ status, paymentStatus: "succeeded", slotStart: at(-25), slotEnd, now });
  assert.equal(view("accepted", at(1)), "accepted");
  assert.equal(view("accepted", at(0)), "session_ended");
  assert.equal(view("accepted", at(-5)), "session_ended");
  for (const status of ["held", "mentee_no_show", "mentor_no_show"]) assert.equal(view(status, at(-5)), status);
});
