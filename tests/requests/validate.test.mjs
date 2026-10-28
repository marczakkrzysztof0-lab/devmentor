// Walidacja wejścia startRequest po stronie serwera (spec #17 Q5, Q6; lib/requests/validate.mjs).
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateStartRequest, MESSAGES } from "../../lib/requests/validate.mjs";

const UUID = "3F2504E0-4F89-41D3-9A0C-0305E82C3301";

const valid = (overrides = {}) => ({
  slug: "jan-kowalski",
  submissionId: UUID,
  lengthMinutes: 25,
  slotStart: "2030-01-15T10:00:00+01:00",
  expectedAmountMinor: 15000,
  menteeName: "Anna",
  question: "Jak zorganizować testy integracyjne w Node?",
  ...overrides,
});

const errorsOf = (input) => {
  const result = validateStartRequest(input);
  assert.equal(result.ok, false);
  return result.errors;
};

test("poprawne wejście jest normalizowane: obcięte teksty, slotStart UTC ISO, submissionId małymi literami", () => {
  const result = validateStartRequest(
    valid({ menteeName: "  Anna  ", question: "  Jak zorganizować testy integracyjne w Node?  " }),
  );
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, {
    slug: "jan-kowalski",
    submissionId: UUID.toLowerCase(),
    lengthMinutes: 25,
    slotStart: "2030-01-15T09:00:00.000Z",
    expectedAmountMinor: 15000,
    menteeName: "Anna",
    question: "Jak zorganizować testy integracyjne w Node?",
  });
});

test("długość 50 minut jest poprawna", () => {
  assert.equal(validateStartRequest(valid({ lengthMinutes: 50 })).ok, true);
});

test("puste pytanie i pytanie z samych białych znaków są odrzucane (AC negatywne)", () => {
  for (const question of ["", "   ", "\n\t  \n"]) {
    assert.equal(errorsOf(valid({ question })).question, MESSAGES.questionShort);
  }
});

test("pytanie: 19 znaków odrzucone, 20 poprawne, 4000 poprawne, 4001 odrzucone (questionLong)", () => {
  assert.equal(errorsOf(valid({ question: "a".repeat(19) })).question, MESSAGES.questionShort);
  assert.equal(validateStartRequest(valid({ question: "a".repeat(20) })).ok, true);
  assert.equal(validateStartRequest(valid({ question: "a".repeat(4000) })).ok, true);
  assert.equal(errorsOf(valid({ question: "a".repeat(4001) })).question, MESSAGES.questionLong);
});

test("pytanie: długość liczona po obcięciu (19 znaków + spacje nadal za krótkie)", () => {
  assert.equal(errorsOf(valid({ question: `   ${"a".repeat(19)}   ` })).question, MESSAGES.questionShort);
});

test("emoji liczy się jako jeden punkt kodowy", () => {
  assert.equal(validateStartRequest(valid({ question: "😀".repeat(20) })).ok, true);
  assert.equal(errorsOf(valid({ question: "😀".repeat(19) })).question, MESSAGES.questionShort);
  assert.equal(validateStartRequest(valid({ question: "😀".repeat(4000) })).ok, true);
  assert.equal(errorsOf(valid({ question: "😀".repeat(4001) })).question, MESSAGES.questionLong);
});

test("imię: 1 znak odrzucone, 2 i 80 poprawne, 81 odrzucone", () => {
  assert.equal(errorsOf(valid({ menteeName: "A" })).menteeName, MESSAGES.menteeName);
  assert.equal(validateStartRequest(valid({ menteeName: "Al" })).ok, true);
  assert.equal(validateStartRequest(valid({ menteeName: "a".repeat(80) })).ok, true);
  assert.equal(errorsOf(valid({ menteeName: "a".repeat(81) })).menteeName, MESSAGES.menteeName);
});

test("imię: puste, same spacje i nie-napis odrzucone", () => {
  for (const menteeName of ["", "   ", 5, null, undefined]) {
    assert.equal(errorsOf(valid({ menteeName })).menteeName, MESSAGES.menteeName);
  }
});

test("błędy pól tekstowych zbierane razem", () => {
  const errors = errorsOf(valid({ menteeName: "A", question: "krótko" }));
  assert.deepEqual(Object.keys(errors).sort(), ["menteeName", "question"]);
});

test("długość sesji spoza 25/50 (np. 30) → błąd przy terminie", () => {
  for (const lengthMinutes of [30, 0, "25", null, undefined]) {
    assert.equal(errorsOf(valid({ lengthMinutes })).slotStart, MESSAGES.slotStart);
  }
});

test("zły uuid próby → błąd przy terminie", () => {
  for (const submissionId of ["", "nie-uuid", "3f2504e0-4f89-41d3-9a0c-0305e82c330", 42, undefined]) {
    assert.equal(errorsOf(valid({ submissionId })).slotStart, MESSAGES.slotStart);
  }
});

test("kwota: nieliczba całkowita, zero, ujemna, napis → błąd przy terminie", () => {
  for (const expectedAmountMinor of [150.5, 0, -100, "15000", null, undefined, Number.NaN]) {
    assert.equal(errorsOf(valid({ expectedAmountMinor })).slotStart, MESSAGES.slotStart);
  }
});

test("slotStart: śmieci, pusty i nie-napis → błąd przy terminie", () => {
  for (const slotStart of ["", "jutro rano", "2030-13-45", 1700000000000, null, undefined]) {
    assert.equal(errorsOf(valid({ slotStart })).slotStart, MESSAGES.slotStart);
  }
});

test("brak sluga → błąd przy terminie", () => {
  assert.equal(errorsOf(valid({ slug: "" })).slotStart, MESSAGES.slotStart);
  assert.equal(errorsOf(valid({ slug: undefined })).slotStart, MESSAGES.slotStart);
});

test("wejście niebędące obiektem → errors.slotStart", () => {
  for (const input of [null, undefined, "tekst", 42, true]) {
    assert.equal(errorsOf(input).slotStart, MESSAGES.slotStart);
  }
});

test("nieznane dodatkowe pola są ignorowane i nie trafiają do wyniku", () => {
  const result = validateStartRequest(valid({ isAdmin: true, status: "accepted", paid: true }));
  assert.equal(result.ok, true);
  assert.deepEqual(Object.keys(result.value).sort(), [
    "expectedAmountMinor",
    "lengthMinutes",
    "menteeName",
    "question",
    "slotStart",
    "slug",
    "submissionId",
  ]);
});
