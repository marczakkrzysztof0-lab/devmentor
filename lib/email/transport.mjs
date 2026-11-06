// Transporty e-mail (spec #17 Q2: „Transports: log (dev, tests capture in memory) and smtp via nodemailer”).
//
// - `smtp` — gdy ustawione `SMTP_URL` (dowolny dostawca SMTP); nadawca `EMAIL_FROM` (wymagany przy SMTP).
// - `log` — bez `SMTP_URL`: e-mail wypisany w logu serwera. Poza produkcją cały tekst (do lokalnego QA), w produkcji
//   tylko adresat i temat — treść zawiera link /r/ (dostęp do zapytania) i nie powinna trafiać do logów hostingu.
// - `memory` — testy: wiadomości zbierane w tablicy.
// Wartości `SMTP_URL` (może zawierać hasło) nigdy nie są logowane.

/** @typedef {import("./outbox.mjs").EmailTransport} EmailTransport */

/**
 * @param {{ log?: { info: (...a: any[]) => void }, production?: boolean }} [options]
 * @returns {EmailTransport}
 */
export function createLogTransport({ log = console, production = process.env.NODE_ENV === "production" } = {}) {
  return {
    async send({ to, subject, text }) {
      log.info(production ? `[email:log] do=${to} temat=„${subject}”` : `[email:log] do=${to}\ntemat: ${subject}\n\n${text}\n`);
    },
  };
}

/** @returns {EmailTransport & { messages: Array<{ to: string, subject: string, text: string }> }} */
export function createMemoryTransport() {
  /** @type {Array<{ to: string, subject: string, text: string }>} */
  const messages = [];
  return {
    messages,
    async send(message) {
      messages.push({ ...message });
    },
  };
}

/**
 * @param {{ smtpUrl: string, from: string }} options
 * @returns {EmailTransport}
 */
export function createSmtpTransport({ smtpUrl, from }) {
  /** @type {Promise<any> | undefined} */
  let transporter;
  return {
    async send({ to, subject, text }) {
      transporter ??= import("nodemailer").then((module) => (module.default ?? module).createTransport(smtpUrl));
      await (await transporter).sendMail({ from, to, subject, text });
    },
  };
}

/**
 * Transport z konfiguracji środowiska: `SMTP_URL` → smtp (wymaga `EMAIL_FROM`), inaczej log.
 * @param {Record<string, string | undefined>} [env]
 * @returns {{ kind: "smtp" | "log", transport: EmailTransport }}
 */
export function transportFromEnv(env = process.env) {
  const smtpUrl = (env.SMTP_URL ?? "").trim();
  if (smtpUrl === "") return { kind: "log", transport: createLogTransport() };
  const from = (env.EMAIL_FROM ?? "").trim();
  if (from === "") throw new Error("Ustawiono SMTP_URL bez EMAIL_FROM — uzupełnij adres nadawcy.");
  return { kind: "smtp", transport: createSmtpTransport({ smtpUrl, from }) };
}
