// Walidacja wejścia `startRequest` po stronie serwera (spec #17 Q5, Q6, API Contracts; Implementation Plan krok 2).
//
// Czysty moduł (bez bazy). Wejście przychodzi z przeglądarki i jest niezaufane: bierzemy tylko znane pola,
// sprawdzamy typy i reguły R05 (pytanie 20–4000 znaków po obcięciu), imię 2–80 znaków, długość 25/50 (R01).
// Długości w punktach kodowych Unicode (`textLength` z `@devmentor/ui/text` — ta sama reguła co reszta formularzy).
// Komunikaty jak w DS `validateRequest` (RequestForm), żeby klient i serwer mówiły to samo.
import { textLength } from "@devmentor/ui/text";

export const MENTEE_NAME_MIN = 2;
export const MENTEE_NAME_MAX = 80;
export const QUESTION_MIN = 20;
export const QUESTION_MAX = 4000;
export const SESSION_LENGTHS = Object.freeze([25, 50]);

export const MESSAGES = Object.freeze({
  slotStart: "Wybierz termin",
  menteeName: "Wpisz imię (od 2 do 80 znaków)",
  questionShort: "Opisz problem w co najmniej 20 znakach — mentor zdecyduje na podstawie pytania",
  questionLong: "Pytanie może mieć najwyżej 4000 znaków — skróć je albo zostaw sam kluczowy fragment kodu",
});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * @typedef {object} StartRequestInput
 * @property {string} slug
 * @property {string} submissionId  uuid z przeglądarki
 * @property {25 | 50} lengthMinutes
 * @property {string} slotStart  UTC ISO (znormalizowany przez `toISOString`)
 * @property {number} expectedAmountMinor  cena pokazana na przycisku (grosze)
 * @property {string} menteeName  po obcięciu
 * @property {string} question  po obcięciu
 * @typedef {Partial<Record<"slotStart" | "menteeName" | "question", string>>} RequestFieldErrors
 */

/**
 * Sprawdza wejście formularza. Pola strukturalne (slug, id próby, kwota, długość, termin) niepoprawne → błąd przy
 * terminie (formularz każe wybrać termin jeszcze raz); nic nie jest zapisywane.
 * @param {unknown} raw
 * @returns {{ ok: true, value: StartRequestInput } | { ok: false, errors: RequestFieldErrors }}
 */
export function validateStartRequest(raw) {
  const input = /** @type {Record<string, unknown>} */ (raw !== null && typeof raw === "object" ? raw : {});
  /** @type {RequestFieldErrors} */
  const errors = {};

  const slug = typeof input.slug === "string" ? input.slug : "";
  const submissionId = typeof input.submissionId === "string" ? input.submissionId : "";
  const lengthMinutes = input.lengthMinutes;
  const expectedAmountMinor = input.expectedAmountMinor;
  const slotText = typeof input.slotStart === "string" ? input.slotStart : "";
  const slotMs = slotText === "" ? Number.NaN : Date.parse(slotText);

  const structuralOk =
    slug !== "" &&
    UUID.test(submissionId) &&
    (lengthMinutes === 25 || lengthMinutes === 50) &&
    Number.isInteger(expectedAmountMinor) &&
    /** @type {number} */ (expectedAmountMinor) > 0 &&
    Number.isFinite(slotMs);
  if (!structuralOk) errors.slotStart = MESSAGES.slotStart;

  const menteeName = typeof input.menteeName === "string" ? input.menteeName.trim() : "";
  const nameLength = textLength(menteeName);
  if (nameLength < MENTEE_NAME_MIN || nameLength > MENTEE_NAME_MAX) errors.menteeName = MESSAGES.menteeName;

  const question = typeof input.question === "string" ? input.question.trim() : "";
  const questionLength = textLength(question);
  if (questionLength < QUESTION_MIN) errors.question = MESSAGES.questionShort;
  else if (questionLength > QUESTION_MAX) errors.question = MESSAGES.questionLong;

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      slug,
      submissionId: submissionId.toLowerCase(),
      lengthMinutes: /** @type {25 | 50} */ (lengthMinutes),
      slotStart: new Date(slotMs).toISOString(),
      expectedAmountMinor: /** @type {number} */ (expectedAmountMinor),
      menteeName,
      question,
    },
  };
}
