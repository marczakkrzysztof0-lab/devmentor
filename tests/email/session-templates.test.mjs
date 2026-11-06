// Szablony e-maili wyniku sesji (#21 Q4; lib/email/templates.mjs): bez treści czatu i pytania (R04).
import { test } from "node:test";
import assert from "node:assert/strict";
import { EMAIL_TEMPLATES, renderEmail } from "../../lib/email/templates.mjs";

const PARAMS = { mentorName: "Anna K.", when: "śr. 28.10.2026, 12:30 (Europe/Warsaw)", amount: "150 zł", question: "Mam błąd hydracji…" };

test("szablony wyniku sesji są zarejestrowane", () => {
  for (const name of ["session_mentor_no_show", "session_mentee_no_show"]) assert.ok(EMAIL_TEMPLATES.includes(name), name);
});

test("session_mentor_no_show: zwrot zlecony, kwota, mentor, termin; bez pytania", () => {
  const { subject, text } = renderEmail("session_mentor_no_show", PARAMS);
  assert.match(subject, /zwrot zlecony/);
  for (const part of [PARAMS.amount, PARAMS.mentorName, PARAMS.when]) assert.ok(text.includes(part), part);
  assert.ok(!text.includes(PARAMS.question));
});

test("session_mentee_no_show: płatność zostaje u mentora, reguła wprost, droga kontaktu; bez pytania", () => {
  const { subject, text } = renderEmail("session_mentee_no_show", PARAMS);
  assert.match(subject, /płatność zostaje u mentora/);
  assert.ok(text.includes(PARAMS.amount));
  assert.match(text, /Zasada:/);
  assert.match(text, /odpowiedz na tę wiadomość/);
  assert.ok(!text.includes(PARAMS.question));
});
