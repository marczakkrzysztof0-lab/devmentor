// Szablony e-maili transakcyjnych (spec #17 Q2, Proposed Solution „Email adapter”; Risks „Sensitive data”).
//
// Zwykły tekst, po polsku, neutralnie płciowo (C12), bez emoji i wykrzykników. ŻADEN szablon nie zawiera treści
// pytania (R04, A08) — parametry dostają tylko imię, termin, długość, kwotę i linki. Parametry są gotowymi napisami
// (termin sformatowany przy zapisie do outboxu), więc wysyłka nie zależy od stref czasowych.
//
// #18: dodatkowo szablony decyzji mentora i wygaśnięcia — request_accepted, request_declined, request_lapsed
// (do płatnika; bez powodu odrzucenia i bez treści pytania — decyzja Q4).

/** @typedef {Record<string, unknown>} Params */

const text = (/** @type {unknown} */ value) => (typeof value === "string" || typeof value === "number" ? String(value) : "");

const FOOTER = "\n\n—\nDevMentor — pytanie do mentora z płatnością z góry.\nTa wiadomość jest wysłana automatycznie.";

/** @type {Record<string, (p: Params) => { subject: string, text: string }>} */
const TEMPLATES = {
  request_confirmation: (p) => ({
    subject: "Pytanie opłacone — czeka na decyzję mentora",
    text: [
      `Płatność ${text(p.amount)} dotarła. Pytanie do: ${text(p.mentorName)} czeka na decyzję mentora.`,
      "",
      `Termin: ${text(p.when)} (${text(p.lengthMinutes)} min, czat tekstowy).`,
      "",
      "Zapisz ten link — przez niego sprawdzisz stan zapytania albo je anulujesz:",
      text(p.requestUrl),
      "",
      "Jeśli mentor odrzuci pytanie albo nie zdecyduje przed terminem, zwrot jest automatyczny.",
    ].join("\n"),
  }),
  request_late_payment: (p) => ({
    subject: "Płatność dotarła za późno — zwrot zlecony",
    text: [
      `Płatność ${text(p.amount)} dotarła po czasie na wybrany termin (${text(p.when)}), więc pytanie nie trafiło do mentora.`,
      `Zwrot ${text(p.amount)} jest zlecony automatycznie na tę samą kartę.`,
      ...(p.requestUrl ? ["", "Stan zapytania:", text(p.requestUrl)] : []),
    ].join("\n"),
  }),
  mentor_new_request: (p) => ({
    subject: `Nowe opłacone pytanie od: ${text(p.menteeName)} — ${text(p.lengthMinutes)} min, ${text(p.when)}`,
    text: [
      `Nowe opłacone pytanie od: ${text(p.menteeName)} — ${text(p.lengthMinutes)} min, ${text(p.when)}.`,
      `Zdecyduj przed ${text(p.decideBy)} — bez decyzji zapytanie wygaśnie, a zwrot będzie automatyczny.`,
      "",
      "Pytanie przeczytasz w aplikacji:",
      text(p.requestLink),
    ].join("\n"),
  }),
  request_accepted: (p) => ({
    subject: `Pytanie zaakceptowane — sesja ${text(p.when)}`,
    text: [
      `Pytanie zostało zaakceptowane przez: ${text(p.mentorName)}.`,
      "",
      `Sesja: ${text(p.when)} (${text(p.lengthMinutes)} min, czat tekstowy).`,
      "",
      "Link do zapytania jest w e-mailu z potwierdzeniem płatności.",
      "Po akceptacji anulowanie ze zwrotem nie jest już możliwe.",
    ].join("\n"),
  }),
  request_declined: (p) => ({
    subject: `Mentor nie przyjmie pytania — zwrot ${text(p.amount)} zlecony`,
    text: [
      `Mentor (${text(p.mentorName)}) nie przyjmie pytania na termin ${text(p.when)}.`,
      `Zwrot ${text(p.amount)} jest zlecony automatycznie na tę samą kartę.`,
      "Drugi e-mail dostaniesz, gdy zwrot zostanie wykonany.",
    ].join("\n"),
  }),
  request_lapsed: (p) => ({
    subject: "Brak odpowiedzi mentora przed terminem — zwrot zlecony",
    text: [
      `Mentor (${text(p.mentorName)}) nie odpowiedział na pytanie przed terminem ${text(p.when)}.`,
      `Zwrot ${text(p.amount)} jest zlecony automatycznie na tę samą kartę.`,
      "Drugi e-mail dostaniesz, gdy zwrot zostanie wykonany.",
    ].join("\n"),
  }),
  refund_succeeded: (p) => ({
    subject: `Zwrot ${text(p.amount)} wykonany`,
    text: [`Zwrot ${text(p.amount)} za zapytanie na termin ${text(p.when)} został wykonany na kartę użytą do płatności.`, "Bank może pokazać go z kilkudniowym opóźnieniem."].join("\n"),
  }),
  refund_failed: (p) => ({
    subject: "Zwrot nie powiódł się — napisz do nas",
    text: [`Zwrot ${text(p.amount)} za zapytanie na termin ${text(p.when)} nie powiódł się automatycznie.`, "Odpowiedz na tę wiadomość — zwrot dokończymy ręcznie."].join("\n"),
  }),
};

export const EMAIL_TEMPLATES = Object.freeze(Object.keys(TEMPLATES));

/**
 * @param {string} template
 * @param {Params} params
 * @returns {{ subject: string, text: string }}
 */
export function renderEmail(template, params) {
  const render = TEMPLATES[template];
  if (!render) {
    const error = new Error(`Nieznany szablon e-maila: ${template}`);
    error.name = "UnknownTemplate";
    throw error;
  }
  const message = render(params ?? {});
  return { subject: message.subject, text: `${message.text}${FOOTER}` };
}
