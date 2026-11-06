// Szablony e-maili decyzji mentora i wygaśnięcia (#18; lib/email/templates.mjs).
import { test } from "node:test";
import assert from "node:assert/strict";
import { EMAIL_TEMPLATES, renderEmail } from "../../lib/email/templates.mjs";

const PARAMS = {
  mentorName: "Jan Kowalski",
  when: "śr. 28.10.2026, 12:30 (Europe/Warsaw)",
  lengthMinutes: 25,
  amount: "150 zł",
  question: "Mam błąd hydracji…",
};

const NAMES = ["request_accepted", "request_declined", "request_lapsed"];
const FOOTER_MARK = "DevMentor — pytanie do mentora z płatnością z góry.";

test("EMAIL_TEMPLATES zawiera szablony decyzji i wygaśnięcia", () => {
  for (const name of NAMES) assert.ok(EMAIL_TEMPLATES.includes(name), name);
});

test("request_accepted: imię mentora, termin, długość, link w mailu z potwierdzeniem", () => {
  const { subject, text } = renderEmail("request_accepted", PARAMS);
  assert.ok(subject.includes(PARAMS.when));
  assert.ok(text.includes(PARAMS.mentorName));
  assert.ok(text.includes(PARAMS.when));
  assert.ok(text.includes("25 min"));
  assert.ok(text.includes("e-mailu z potwierdzeniem płatności"));
  assert.ok(text.includes(FOOTER_MARK));
});

test("request_declined: kwota zwrotu w temacie i tekście, stopka", () => {
  const { subject, text } = renderEmail("request_declined", PARAMS);
  assert.ok(subject.includes(PARAMS.amount));
  assert.ok(text.includes(PARAMS.amount));
  assert.ok(text.includes(PARAMS.mentorName));
  assert.ok(text.includes(PARAMS.when));
  assert.ok(text.includes(FOOTER_MARK));
});

test("request_lapsed: kwota, termin i mentor w tekście, stopka", () => {
  const { subject, text } = renderEmail("request_lapsed", PARAMS);
  assert.ok(subject.includes("zwrot zlecony"));
  assert.ok(text.includes(PARAMS.amount));
  assert.ok(text.includes(PARAMS.mentorName));
  assert.ok(text.includes(PARAMS.when));
  assert.ok(text.includes(FOOTER_MARK));
});

test("żaden z szablonów nie ma wykrzykników ani treści pytania", () => {
  for (const name of NAMES) {
    const { subject, text } = renderEmail(name, PARAMS);
    assert.ok(!text.includes("!") && !subject.includes("!"), `${name}: wykrzyknik`);
    assert.ok(!text.includes(PARAMS.question) && !subject.includes(PARAMS.question), `${name}: pytanie`);
    assert.ok(!text.includes("undefined") && !subject.includes("undefined"), `${name}: undefined`);
  }
});
