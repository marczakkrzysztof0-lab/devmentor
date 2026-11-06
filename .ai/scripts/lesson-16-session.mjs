// Lekcja 16 — scena do prób kontroli dostępu (wołane przez `.ai/scripts/lesson-16-prepare.sh`).
//
// Działa WYŁĄCZNIE na jednorazowym środowisku z `.ai/scripts/test-env-up.sh` (schemat `dm_migtest_*`, `next start`
// na 127.0.0.1) i na danych syntetycznych. Odmawia pracy, gdy deskryptor nie wskazuje lokalnego, działającego
// środowiska efemerycznego.
//
//   node .ai/scripts/lesson-16-session.mjs seed      dane sceny + jednorazowe linki logowania (do pliku, nie na ekran)
//   node .ai/scripts/lesson-16-session.mjs snapshot  stan wiadomości sesji BOOKING_ID z bazy (JSON na stdout)
//
// Co tworzy `seed` (funkcjami domeny + fałszywy Stripe w procesie, jak `tests/requests/fixtures.mjs`):
//   - mentor A („właściciel”): opublikowana strona, opłacone i zaakceptowane zapytanie z OTWARTĄ sesją
//     (BOOKING_ID, termin przesunięty SQL-em na „teraz”, jak `tests/e2e/session-chat.e2e.mjs`) z dwiema
//     wiadomościami + opłacone zapytanie czekające na decyzję (PENDING_ID, termin w przyszłości);
//   - mentor B („drugie konto”): własne opłacone, zaakceptowane zapytanie z otwartą sesją (BOOKING_B_ID);
//   - linki logowania obu mentorów (`createSignInLink`, jak CLI `mentor:sign-in-link`) → plik sekretów sceny.
// Tokeny (linki logowania, linki /r/ dewelopera) trafiają tylko do `.ai/tmp/lesson-16/secrets.env` (gitignored)
// i nigdy na stdout.
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { acceptInvitation } from "../../lib/auth/mentor-auth.mjs";
import { listOpenSlotsForMentor } from "../../lib/availability/queries.mjs";
import { saveAvailability } from "../../lib/availability/save.mjs";
import { saveMentorPage } from "../../lib/mentor-page/mentor-page.mjs";
import { syncCheckout } from "../../lib/payments/payments.mjs";
import { acceptRequest } from "../../lib/requests/decision.mjs";
import { requestPaymentSubscriber } from "../../lib/requests/payment-subscriber.mjs";
import { resolveRequestCheckout, startRequest } from "../../lib/requests/start.mjs";
import { postSessionMessage } from "../../lib/sessions/messages.mjs";
import { createInvitation, createSignInLink } from "../../scripts/mentor-links.mjs";
import { makeDeps } from "../../tests/payments/helpers.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DESCRIPTOR = path.join(ROOT, ".ai", "qa", "test-env.json");
const OUT_DIR = path.join(ROOT, ".ai", "tmp", "lesson-16");
const SECRETS = path.join(OUT_DIR, "secrets.env");
const SEED_FILE = path.join(OUT_DIR, "seed.env");

const DAILY = [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ weekday, startMinute: 0, endMinute: 24 * 60 }));
export const OWNER_QUESTION = "L16-WLASCICIEL: syntetyczne pytanie mentora A o cache w Next.js 16 (nie ujawniać innym).";
export const PENDING_QUESTION = "L16-OCZEKUJACE: syntetyczne pytanie czekające na decyzję mentora A.";
export const OTHER_QUESTION = "L16-DRUGIE-KONTO: syntetyczne pytanie mentora B.";

function environment() {
  let descriptor;
  try {
    descriptor = JSON.parse(readFileSync(DESCRIPTOR, "utf8"));
  } catch {
    throw new Error("Brak .ai/qa/test-env.json — najpierw sh .ai/scripts/test-env-up.sh");
  }
  const baseUrl = new URL(descriptor.baseUrl);
  const schema = descriptor.services?.[0]?.schema ?? "";
  if (descriptor.status !== "running" || descriptor.mode !== "ephemeral") throw new Error("Środowisko testowe nie działa (status != running/ephemeral).");
  if (!["localhost", "127.0.0.1"].includes(baseUrl.hostname)) throw new Error(`Odmowa: ${baseUrl.hostname} to nie localhost.`);
  if (!/^dm_migtest_[0-9a-f]{16}$/.test(schema)) throw new Error("Odmowa: schemat nie jest jednorazowym schematem testowym.");
  return { baseUrl: descriptor.baseUrl, schema };
}

async function pool(schema) {
  const { DATABASE_URL } = await import("../../tests/db/harness.mjs");
  const { withSearchPath } = await import("../../scripts/test-e2e.mjs");
  if (!DATABASE_URL) throw new Error("Brak DATABASE_URL (.env.local) — npm run setup.");
  const host = new URL(DATABASE_URL).hostname;
  if (!["localhost", "127.0.0.1"].includes(host)) throw new Error("Odmowa: baza spoza localhost.");
  return new pg.Pool({ connectionString: withSearchPath(DATABASE_URL, schema), max: 3 });
}

async function seedMentor(db, appUrl, label, displayName) {
  const email = `l16-${label}-${Date.now().toString(36)}@example.com`;
  const { url } = await createInvitation({ db, email, appUrl });
  const accepted = await acceptInvitation({ db, token: url.slice(url.lastIndexOf("/") + 1) });
  if (!accepted.ok) throw new Error(`seed: zaproszenie ${label} nie przyjęte`);
  const slug = `l16-${label}-${Date.now().toString(36)}`;
  const input = { displayName, publicWorkUrl: "https://github.com/devmentor-test", description: `Konto syntetyczne lekcji 16 (${label}).`, price25: "150", price50: "280", slug };
  const saved = await saveMentorPage({ db, mentorId: accepted.mentorId, input, publish: true, appUrl });
  if (!saved.ok) throw new Error(`seed: strona ${label} nie opublikowana`);
  const availability = await saveAvailability({ db, mentorId: accepted.mentorId, input: { timeZone: "Europe/Warsaw", windows: DAILY } });
  if (!availability.ok) throw new Error(`seed: dostępność ${label} nie zapisana`);
  // Sesja z przyjęcia zaproszenia jest zbędna — logowanie przez HTTP linkiem logowania.
  await db.query("update mentor_sessions set revoked_at = now() where mentor_id = $1", [accepted.mentorId]);
  return { mentorId: accepted.mentorId, slug, email };
}

/** Opłacone zapytanie (`awaiting_mentor`) przez prawdziwy przepływ startRequest + fałszywy Stripe. */
async function paidRequest(db, appUrl, mentor, slot, { menteeName, question }) {
  const ctx = makeDeps({ pool: db }, { start: new Date() });
  const recorder = ctx.deps.subscribers[0];
  ctx.deps.subscribers = [requestPaymentSubscriber, recorder];
  ctx.deps.resolveCheckoutRequest = resolveRequestCheckout;
  ctx.deps.now = () => new Date();
  const input = { slug: mentor.slug, submissionId: randomUUID(), lengthMinutes: 25, slotStart: slot.startsAt, expectedAmountMinor: 15000, menteeName, question };
  const result = await startRequest(input, { db, payments: ctx.deps, appUrl, now: () => new Date() });
  if (!result.ok) throw new Error(`seed: startRequest ${JSON.stringify(result.code)}`);
  const { rows } = await db.query(
    "select r.id, r.payment_id, p.stripe_checkout_session_id as session_id from requests r join payments p on p.id = r.payment_id where r.mentor_id = $1 and r.slot_start = $2",
    [mentor.mentorId, slot.startsAt],
  );
  const request = rows[0];
  const { rows: drafts } = await db.query("select params from outbound_emails where params ->> 'requestId' = $1", [request.id]);
  const token = drafts[0].params.requestUrl.split("/r/")[1];
  ctx.fake.completeSession(request.session_id, { email: `l16-dev-${Date.now()}@example.com` });
  await syncCheckout(request.payment_id, request.session_id, ctx.deps);
  return { id: request.id, token };
}

async function openSession(db, appUrl, mentor, slot, who) {
  const request = await paidRequest(db, appUrl, mentor, slot, who);
  const accepted = await acceptRequest({ mentorId: mentor.mentorId, requestId: request.id }, { db, payments: null });
  if (!accepted.ok) throw new Error(`seed: akceptacja ${JSON.stringify(accepted)}`);
  // Termin na „teraz” (sesja trwa 25 min) — jak `moveSlot` w tests/e2e/session-chat.e2e.mjs.
  await db.query(
    `update requests set slot_start = date_trunc('second', now()) - interval '1 minute',
                         slot_end = date_trunc('second', now()) - interval '1 minute' + make_interval(mins => length_minutes)
      where id = $1`,
    [request.id],
  );
  return request;
}

function apart(slots, count) {
  const chosen = [];
  for (const slot of slots) {
    if (chosen.every((c) => Math.abs(new Date(slot.startsAt).getTime() - new Date(c.startsAt).getTime()) >= 2 * 3600_000)) chosen.push(slot);
    if (chosen.length === count) return chosen;
  }
  throw new Error(`seed: za mało wolnych terminów (${chosen.length}/${count})`);
}

async function seed() {
  const { baseUrl, schema } = environment();
  const db = await pool(schema);
  try {
    const owner = await seedMentor(db, baseUrl, "a", "Mentor A (L16)");
    const other = await seedMentor(db, baseUrl, "b", "Mentor B (L16)");
    // Terminy co najmniej 2 h od teraz (akceptacja wymaga terminu w przyszłości).
    const later = new Date(Date.now() + 3 * 3600_000);
    const [slotA1, slotA2] = apart(await listOpenSlotsForMentor({ db, mentorId: owner.mentorId, now: later }), 2);
    const [slotB] = apart(await listOpenSlotsForMentor({ db, mentorId: other.mentorId, now: later }), 1);

    const booking = await openSession(db, baseUrl, owner, slotA1, { menteeName: "Deweloper A", question: OWNER_QUESTION });
    const pending = await paidRequest(db, baseUrl, owner, slotA2, { menteeName: "Deweloper A2", question: PENDING_QUESTION });
    const bookingB = await openSession(db, baseUrl, other, slotB, { menteeName: "Deweloper B", question: OTHER_QUESTION });

    for (const [viewer, body] of [
      [{ kind: "mentee", token: booking.token }, "L16 wiadomość dewelopera A (syntetyczna)"],
      [{ kind: "mentor", mentorId: owner.mentorId, requestId: booking.id }, "L16 odpowiedź mentora A (syntetyczna)"],
    ]) {
      const posted = await postSessionMessage(db, /** @type {any} */ (viewer), body);
      if (!posted.ok) throw new Error(`seed: wiadomość ${posted.code}`);
    }

    const linkA = await createSignInLink({ db, email: owner.email, appUrl: baseUrl });
    const linkB = await createSignInLink({ db, email: other.email, appUrl: baseUrl });
    mkdirSync(OUT_DIR, { recursive: true });
    writeFileSync(
      SECRETS,
      [`SIGN_IN_PATH_A=${new URL(linkA.url).pathname}`, `SIGN_IN_PATH_B=${new URL(linkB.url).pathname}`, `DEV_TOKEN_A=${booking.token}`, `DEV_TOKEN_B=${bookingB.token}`, ""].join("\n"),
      { mode: 0o600 },
    );
    writeFileSync(
      SEED_FILE,
      [
        `BASE_URL=${baseUrl}`,
        `BOOKING_ID=${booking.id}`,
        `BOOKING_B_ID=${bookingB.id}`,
        `PENDING_ID=${pending.id}`,
        `MENTOR_A_ID=${owner.mentorId}`,
        `MENTOR_B_ID=${other.mentorId}`,
        `SCHEMA=${schema}`,
        "",
      ].join("\n"),
    );
    console.log(`[lesson-16] scena gotowa: BOOKING_ID=${booking.id} BOOKING_B_ID=${bookingB.id} PENDING_ID=${pending.id} (tokeny tylko w .ai/tmp/lesson-16/secrets.env)`);
  } finally {
    await db.end();
  }
}

/** Stan bazy dla zapytań sceny: wiadomości (id, autor, treść) i status zapytania — dowód „dane bez zmian”. */
async function snapshot() {
  const { schema } = environment();
  const ids = Object.fromEntries(
    readFileSync(SEED_FILE, "utf8")
      .split("\n")
      .filter((line) => line.includes("="))
      .map((line) => line.split("=", 2)),
  );
  const db = await pool(schema);
  try {
    const messages = await db.query("select id, author, body from session_messages where request_id = $1 order by seq", [ids.BOOKING_ID]);
    const requests = await db.query("select id, status, mentor_id, accepted_at, declined_at from requests where id = any($1) order by id", [[ids.BOOKING_ID, ids.PENDING_ID]]);
    console.log(JSON.stringify({ messages: messages.rows, requests: requests.rows }, null, 2));
  } finally {
    await db.end();
  }
}

const command = process.argv[2];
const commands = { seed, snapshot };
if (!Object.hasOwn(commands, command)) {
  console.error("Użycie: node .ai/scripts/lesson-16-session.mjs seed | snapshot");
  process.exit(2);
}
commands[command]().then(
  () => process.exit(0),
  (error) => {
    console.error(`[lesson-16] ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  },
);
