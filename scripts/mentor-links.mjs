// CLI założycieli (spec #14, Q5 i API Contracts „CLI”):
//   npm run mentor:invite -- <email>         link zaproszenia, ważny 14 dni
//   npm run mentor:sign-in-link -- <email>   jednorazowy link logowania, ważny 72 h
//
// Wypisuje link zbudowany z NEXT_PUBLIC_APP_URL. Token jest tylko w wypisanym linku;
// w bazie zapisywany jest wyłącznie jego hash SHA-256 (lib/auth/tokens.mjs).
//
// E-mail: przycinamy białe znaki i zapisujemy w zaproszeniu małymi literami (decyzja zadania 2.2) —
// `mentors` ma unikalny indeks na lower(email), a e-mail mentora kopiowany jest z zaproszenia
// przy akceptacji, więc trzymamy jedną, kanoniczną postać. Porównania zawsze przez lower(email).
import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { createPool, MISSING_DATABASE_URL_MESSAGE } from "../lib/db/pool.mjs";
import {
  generateToken,
  hashToken,
  INVITATION_TTL_DAYS,
  SIGN_IN_LINK_TTL_HOURS,
} from "../lib/auth/tokens.mjs";
import { ENV_FILE, isDatabaseUnreachable, UNREACHABLE_MESSAGE } from "./db-migrate.mjs";

/** Znany błąd z czytelnym komunikatem dla użytkownika (CLI wypisuje go bez stack trace). */
export class MentorLinksError extends Error {}

export const MISSING_APP_URL_MESSAGE =
  "Brak NEXT_PUBLIC_APP_URL. Uzupełnij .env.local (wzór w .env.example) albo ustaw zmienną środowiskową.";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

// Podstawowy kształt adresu: coś@domena.tld, bez białych znaków; limit długości wg RFC 5321.
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMAIL_MAX_LENGTH = 254;

/**
 * Przycina i sprawdza adres e-mail; zwraca go małymi literami. Rzuca MentorLinksError przy złym kształcie.
 * @param {unknown} raw
 * @returns {string}
 */
export function normalizeEmail(raw) {
  const email = typeof raw === "string" ? raw.trim() : "";
  if (email === "") throw new MentorLinksError("Podaj adres e-mail mentora.");
  if (email.length > EMAIL_MAX_LENGTH || !EMAIL_SHAPE.test(email)) {
    throw new MentorLinksError(`„${email}” nie wygląda na adres e-mail.`);
  }
  return email.toLowerCase();
}

/**
 * Adres aplikacji bez końcowego ukośnika (z NEXT_PUBLIC_APP_URL). Rzuca MentorLinksError, gdy brak
 * albo gdy to nie jest adres http(s).
 * @param {unknown} raw
 * @returns {string}
 */
export function normalizeAppUrl(raw) {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (value === "") throw new MentorLinksError(MISSING_APP_URL_MESSAGE);
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    parsed = undefined;
  }
  if (!parsed || (parsed.protocol !== "http:" && parsed.protocol !== "https:")) {
    throw new MentorLinksError(
      `NEXT_PUBLIC_APP_URL „${value}” nie jest adresem http(s), np. http://localhost:3000.`,
    );
  }
  return value.replace(/\/+$/, "");
}

/** @param {unknown} now */
function toDate(now) {
  const date = now instanceof Date ? now : new Date(/** @type {any} */ (now ?? Date.now()));
  if (Number.isNaN(date.getTime())) throw new MentorLinksError("Niepoprawna data bieżąca (now).");
  return date;
}

/**
 * @param {import("../lib/db/pool.mjs").Queryable} db
 * @param {string} email znormalizowany (małe litery)
 * @returns {Promise<string | undefined>} id mentora z tym adresem (bez względu na wielkość liter)
 */
async function findMentorIdByEmail(db, email) {
  const { rows } = await db.query("select id from mentors where lower(email) = lower($1)", [email]);
  return rows[0]?.id;
}

/**
 * Tworzy zaproszenie: zapisuje hash tokenu i datę ważności (teraz + 14 dni), zwraca link.
 * Odmawia, gdy mentor z tym adresem już istnieje (wtedy właściwy jest link logowania).
 * @param {object} options
 * @param {import("../lib/db/pool.mjs").Queryable} options.db
 * @param {string} options.email
 * @param {string} options.appUrl np. http://localhost:3000 (końcowy ukośnik jest usuwany)
 * @param {Date} [options.now] domyślnie bieżąca chwila
 * @returns {Promise<{ url: string, expiresAt: Date }>}
 */
export async function createInvitation({ db, email, appUrl, now }) {
  const normalizedEmail = normalizeEmail(email);
  const baseUrl = normalizeAppUrl(appUrl);
  const createdAt = toDate(now);

  if (await findMentorIdByEmail(db, normalizedEmail)) {
    throw new MentorLinksError(
      `Mentor z adresem ${normalizedEmail} już istnieje — zamiast zaproszenia wyślij link logowania: ` +
        `npm run mentor:sign-in-link -- ${normalizedEmail}`,
    );
  }

  const token = generateToken();
  const expiresAt = new Date(createdAt.getTime() + INVITATION_TTL_DAYS * DAY_MS);
  await db.query(
    "insert into invitations (email, token_hash, expires_at, created_at) values ($1, $2, $3, $4)",
    [normalizedEmail, hashToken(token), expiresAt, createdAt],
  );
  return { url: `${baseUrl}/invite/${token}`, expiresAt };
}

/**
 * Tworzy jednorazowy link logowania dla istniejącego mentora (teraz + 72 h), zwraca link.
 * @param {object} options
 * @param {import("../lib/db/pool.mjs").Queryable} options.db
 * @param {string} options.email
 * @param {string} options.appUrl
 * @param {Date} [options.now]
 * @returns {Promise<{ url: string, expiresAt: Date }>}
 */
export async function createSignInLink({ db, email, appUrl, now }) {
  const normalizedEmail = normalizeEmail(email);
  const baseUrl = normalizeAppUrl(appUrl);
  const createdAt = toDate(now);

  const mentorId = await findMentorIdByEmail(db, normalizedEmail);
  if (!mentorId) {
    throw new MentorLinksError(
      `Nie ma mentora z adresem ${normalizedEmail}. Nowej osobie wyślij zaproszenie: ` +
        `npm run mentor:invite -- ${normalizedEmail}`,
    );
  }

  const token = generateToken();
  const expiresAt = new Date(createdAt.getTime() + SIGN_IN_LINK_TTL_HOURS * HOUR_MS);
  await db.query(
    "insert into mentor_sign_in_links (mentor_id, token_hash, expires_at, created_at) values ($1, $2, $3, $4)",
    [mentorId, hashToken(token), expiresAt, createdAt],
  );
  return { url: `${baseUrl}/sign-in/${token}`, expiresAt };
}

const EXPIRY_FORMAT = new Intl.DateTimeFormat("pl-PL", {
  timeZone: "Europe/Warsaw",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/**
 * Data ważności w czasie polskim, np. „04.11.2026, 12:00”.
 * @param {Date} date
 * @returns {string}
 */
export function formatExpiry(date) {
  return EXPIRY_FORMAT.format(date);
}

export const COMMANDS = {
  invite: { create: createInvitation, label: "Link zaproszenia" },
  "sign-in-link": { create: createSignInLink, label: "Link logowania" },
};

export const HELP_TEXT = `Linki dla mentorów (tylko dla założycieli).

Użycie:
  npm run mentor:invite -- <email>         link zaproszenia (ważny ${INVITATION_TTL_DAYS} dni)
  npm run mentor:sign-in-link -- <email>   jednorazowy link logowania dla istniejącego mentora
                                           (ważny ${SIGN_IN_LINK_TTL_HOURS} h)

Bezpośrednio: node scripts/mentor-links.mjs invite|sign-in-link <email>

Zmienne: DATABASE_URL i NEXT_PUBLIC_APP_URL. Skrypt wczytuje .env.local, jeśli istnieje;
zmienna już ustawiona w środowisku ma pierwszeństwo przed plikiem.`;

/**
 * Argumenty CLI → `{ help: true }` albo `{ command, email }` (e-mail jeszcze nieznormalizowany).
 * Rzuca MentorLinksError przy złych argumentach. Funkcja czysta.
 * @param {string[]} argv
 * @returns {{ help: true } | { help?: false, command: "invite" | "sign-in-link", email: string }}
 */
export function parseCliArgs(argv) {
  if (argv.includes("--help") || argv.includes("-h")) return { help: true };
  const [command, ...rest] = argv;
  if (command !== "invite" && command !== "sign-in-link") {
    throw new MentorLinksError(
      `Nieznane polecenie „${command ?? ""}”. Użyj \`npm run mentor:invite -- <email>\` ` +
        "albo `npm run mentor:sign-in-link -- <email>` (--help).",
    );
  }
  if (rest.length !== 1) {
    throw new MentorLinksError(
      rest.length === 0
        ? `Podaj adres e-mail mentora, np. npm run mentor:${command} -- anna@example.com`
        : `Podaj dokładnie jeden adres e-mail (podano: ${rest.join(" ")}).`,
    );
  }
  return { command, email: rest[0] };
}

/**
 * Tekst wyniku dla założyciela.
 * @param {"invite" | "sign-in-link"} command
 * @param {{ url: string, expiresAt: Date }} result
 * @returns {string}
 */
export function formatResult(command, { url, expiresAt }) {
  return [
    `✔ ${COMMANDS[command].label}:`,
    "",
    `  ${url}`,
    "",
    `Ważny do ${formatExpiry(expiresAt)} (czas polski).`,
    "Link jest jednorazowy — wyślij go osobiście tylko tej osobie i nie publikuj go nigdzie.",
  ].join("\n");
}

/**
 * Uruchamia CLI. Zwraca kod wyjścia: 0 przy sukcesie, 1 przy błędzie. Pula zawsze zamykana.
 * @param {object} options
 * @param {string[]} options.argv
 * @param {Record<string, string | undefined>} options.env
 * @param {() => void} options.loadEnv
 * @param {(databaseUrl: string) => import("pg").Pool} [options.createDb]
 * @param {(line: string) => void} [options.log]
 * @param {() => Date} [options.clock]
 * @returns {Promise<number>}
 */
export async function runCli({
  argv,
  env,
  loadEnv,
  createDb = createPool,
  log = console.log,
  clock = () => new Date(),
}) {
  /** @type {import("pg").Pool | undefined} */
  let db;
  try {
    const args = parseCliArgs(argv);
    if (args.help) {
      log(HELP_TEXT);
      return 0;
    }
    loadEnv();
    const appUrl = normalizeAppUrl(env.NEXT_PUBLIC_APP_URL);
    if (!env.DATABASE_URL?.trim()) throw new MentorLinksError(MISSING_DATABASE_URL_MESSAGE);
    db = createDb(env.DATABASE_URL);
    const result = await COMMANDS[args.command].create({ db, email: args.email, appUrl, now: clock() });
    log(formatResult(args.command, result));
    return 0;
  } catch (error) {
    if (error instanceof MentorLinksError) {
      log(`✖ ${error.message}`);
    } else if (isDatabaseUnreachable(error)) {
      log(`✖ ${UNREACHABLE_MESSAGE}`);
    } else {
      log(`✖ Nie udało się utworzyć linku: ${error instanceof Error ? error.message : String(error)}`);
    }
    return 1;
  } finally {
    await db?.end().catch(() => {});
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  process.exitCode = await runCli({
    argv: process.argv.slice(2),
    env: process.env,
    // Wartości już obecne w process.env nie są nadpisywane przez plik.
    loadEnv: () => {
      if (existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE);
    },
    log: (line) => console.log(line),
  });
}
