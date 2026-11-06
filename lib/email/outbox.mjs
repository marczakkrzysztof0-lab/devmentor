// Adapter e-mail: outbox w bazie (spec #17 Q2, Proposed Solution „Email adapter”; Implementation Plan krok 6).
//
// - `enqueueEmail(tx, …)` zapisuje wiersz `outbound_emails` w transakcji wywołującego — e-mail istnieje tylko,
//   jeśli zmiana, o której mówi, została zatwierdzona. `draft` = adresat jeszcze nieznany (adres dewelopera
//   przychodzi ze Stripe); szkic wysyła się dopiero po ustawieniu adresu i statusu `due`.
// - `sendDue` (zadanie `email.sendDue`, opcjonalnie od razu po commicie) zajmuje e-maile dzierżawą jak zwroty #24
//   (`FOR UPDATE SKIP LOCKED` + `lease_until`), wysyła, a po wysłaniu albo porażce ZERUJE `params` (link /r/
//   żyje w bazie tylko do wysłania). Rzadki duplikat jest akceptowalny, zgubiony e-mail — nie.
// - Porażka transportu: kolejna próba po 1, 5, 15, 60 min, potem co godzinę; po 24 h od utworzenia → `failed` + log.
// - Do `last_error` trafia tylko kod błędu dostawcy, nigdy treść.
import { renderEmail } from "./templates.mjs";

const MINUTE_MS = 60_000;
export const EMAIL_LEASE_MINUTES = 2;
export const EMAIL_BACKOFF_MINUTES = Object.freeze([1, 5, 15, 60]);
export const EMAIL_GIVE_UP_HOURS = 24;

/**
 * @typedef {{ send: (message: { to: string, subject: string, text: string }) => Promise<void> }} EmailTransport
 */

/**
 * Wstawia e-mail do outboxu w transakcji wywołującego.
 * @param {import("../db/pool.mjs").Queryable} tx
 * @param {{ to: string | null, template: string, params: Record<string, unknown>, draft?: boolean }} email
 * @param {{ now: Date }} ctx
 * @returns {Promise<string>} id e-maila
 */
export async function enqueueEmail(tx, { to, template, params, draft = false }, { now }) {
  if (!draft && !to) throw new Error("enqueueEmail: brak adresata (dozwolone tylko dla szkicu)");
  const { rows } = await tx.query(
    `insert into outbound_emails (to_address, template, params, status, next_attempt_at, created_at)
     values ($1, $2, $3, $4, $5, $5)
     returning id`,
    [to, template, JSON.stringify(params), draft ? "draft" : "due", now],
  );
  return rows[0].id;
}

/** Odstęp przed kolejną próbą po porażce próby nr `attempt`. */
export function emailBackoffMinutes(attempt) {
  return EMAIL_BACKOFF_MINUTES[Math.max(0, attempt - 1)] ?? 60;
}

/**
 * Wysyła należne e-maile (zadanie `email.sendDue`). `ids` — tylko te (np. świeżo zatwierdzone), inaczej paczka
 * najstarszych należnych.
 * @param {import("pg").Pool} db
 * @param {{ transport: EmailTransport, now?: () => Date, log?: { warn: Function, error: Function } }} deps
 * @param {{ ids?: string[], limit?: number, deadline?: number }} [options]
 */
export async function sendDue(db, { transport, now = () => new Date(), log = console }, { ids, limit = 50, deadline = Infinity } = {}) {
  const claimAt = now();
  const { rows } = await db.query(
    `update outbound_emails
        set lease_until = $1, attempts = attempts + 1
      where id in (
        select id from outbound_emails
         where status = 'due' and next_attempt_at <= $2
           and (lease_until is null or lease_until < $2)
           and ($3::uuid[] is null or id = any($3::uuid[]))
         order by next_attempt_at
         limit $4
         for update skip locked)
      returning id, to_address, template, params, attempts, created_at`,
    [new Date(claimAt.getTime() + EMAIL_LEASE_MINUTES * MINUTE_MS), claimAt, ids ?? null, limit],
  );
  const counts = { sent: 0, retry: 0, failed: 0 };
  for (const email of rows) {
    if (Date.now() > deadline) break;
    try {
      const message = renderEmail(email.template, email.params ?? {});
      await transport.send({ to: email.to_address, ...message });
      await db.query(
        `update outbound_emails set status = 'sent', sent_at = $2, params = null, lease_until = null, last_error = null
          where id = $1 and status = 'due'`,
        [email.id, now()],
      );
      counts.sent += 1;
    } catch (error) {
      const code = errorCode(error);
      const at = now();
      if (at.getTime() - new Date(email.created_at).getTime() >= EMAIL_GIVE_UP_HOURS * 60 * MINUTE_MS) {
        await db.query(
          `update outbound_emails set status = 'failed', params = null, lease_until = null, last_error = $2
            where id = $1 and status = 'due'`,
          [email.id, code],
        );
        log.error(`[email] e-mail ${email.id} (${email.template}) nie wysłany przez ${EMAIL_GIVE_UP_HOURS} h — failed (${code})`);
        counts.failed += 1;
      } else {
        await db.query(
          `update outbound_emails set next_attempt_at = $2, lease_until = null, last_error = $3
            where id = $1 and status = 'due'`,
          [email.id, new Date(at.getTime() + emailBackoffMinutes(Number(email.attempts)) * MINUTE_MS), code],
        );
        log.warn(`[email] e-mail ${email.id} (${email.template}), próba ${email.attempts}: ${code} — ponowienie`);
        counts.retry += 1;
      }
    }
  }
  return counts;
}

/** Kod błędu dostawcy (nodemailer: `code`, `responseCode`) — bez treści komunikatu. */
function errorCode(error) {
  const e = /** @type {{ code?: unknown, responseCode?: unknown, name?: unknown }} */ (error ?? {});
  const code = typeof e.code === "string" ? e.code : typeof e.name === "string" ? e.name : "unknown_error";
  return `${code}${typeof e.responseCode === "number" ? ` smtp=${e.responseCode}` : ""}`.slice(0, 100);
}
