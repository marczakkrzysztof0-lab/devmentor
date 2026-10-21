// Dostęp do strony mentora dla edytora `/mentor` i jego server action (spec #14 Phase 2) — tylko serwer.
//
// - Id mentora wyłącznie z sesji (`getCurrentMentor()`); bez sesji: `null` / `unauthorized`, baza nietknięta.
// - Logika i SQL: `lib/mentor-page/mentor-page.mjs` (testowana przez `node --test`).
// - Adres linku do udostępnienia z NEXT_PUBLIC_APP_URL (bez końcowego ukośnika).
import "server-only";
import { getCurrentMentor } from "@/lib/auth/session";
import { getPool } from "@/lib/db";
import {
  getMentorPageForEditor,
  saveMentorPageForSession,
  shareUrlFor,
  toFormValues,
  type MentorPageErrors,
  type MentorPageFormValues,
} from "./mentor-page.mjs";
import { currencyLabel } from "./validate.mjs";

/** Wynik zapisu dla klienta (spec #14 API Contracts; `unauthorized` = L6/Z7). */
export type SaveMentorPageActionResult =
  | { ok: true; shareUrl?: string }
  | { ok: false; errors: MentorPageErrors }
  | { ok: false; reason: "unauthorized" };

/** Dane startowe edytora (dla `MentorPageForm`, zadanie 3.4). */
export type MentorPageEditorData = {
  /** `MentorPageForm.initial`: napisy, ceny w pełnych złotych. */
  initial: MentorPageFormValues;
  published: boolean;
  /** Slug to losowy `mentor-xxxxxx` — edytor może go nadpisać propozycją z imienia (Q6, Z10; luka DS D4). */
  slugIsPlaceholder: boolean;
  /** Link do udostępnienia opublikowanej strony (L8/Z9; luka DS D6), inaczej null. */
  shareUrl: string | null;
  /** `MentorPageForm.baseUrl`. */
  baseUrl: string;
  /** Kod waluty z `mentor_pages.currency` i jej etykieta („zł”) do etykiet i sufiksu cen (F2). */
  currency: string;
  currencyLabel: string;
};

/** Odczyt przez `Reflect.get`: `process.env.NEXT_PUBLIC_*` (także `process.env[stała]`) Next.js wkleja do kodu przy `next build`. */
const APP_URL_ENV = "NEXT_PUBLIC_APP_URL";

/**
 * Adres aplikacji (NEXT_PUBLIC_APP_URL) bez końcowego ukośnika — czytany w czasie działania serwera, a nie
 * wklejony przy buildzie (inaczej serwer uruchomiony z innym adresem, np. e2e na losowym porcie, dawałby
 * link z adresem z czasu buildu).
 */
export function appBaseUrl(): string {
  const value = String(Reflect.get(process.env, APP_URL_ENV) ?? "").trim().replace(/\/+$/, "");
  if (value === "") throw new Error("Brak NEXT_PUBLIC_APP_URL. Uzupełnij .env.local (wzór w .env.example).");
  return value;
}

/**
 * Strona zalogowanego mentora dla edytora albo `null` bez sesji (wtedy strona pokazuje „Dostęp tylko przez
 * zaproszenie…”). Odczyt żądania — wołaj za <Suspense>, po `connection()`.
 */
export async function loadMentorPageEditor(): Promise<MentorPageEditorData | null> {
  const mentor = await getCurrentMentor();
  if (!mentor) return null;
  const page = await getMentorPageForEditor({ db: getPool(), mentorId: mentor.mentorId });
  if (!page) throw new Error("Brak strony mentora dla bieżącej sesji.");
  const baseUrl = appBaseUrl();
  const published = page.publishedAt !== null;
  return {
    initial: toFormValues(page),
    published,
    slugIsPlaceholder: page.isPlaceholderSlug,
    shareUrl: published ? shareUrlFor(baseUrl, page.slug) : null,
    baseUrl,
    currency: page.currency,
    currencyLabel: currencyLabel(page.currency),
  };
}

/**
 * Zapis strony bieżącego mentora (wołany z server action). Wejście to niezaufane dane od klienta:
 * brane są tylko znane pola formularza; `publish` liczy się tylko jako `true`.
 */
export async function saveCurrentMentorPage(input: unknown, publish: unknown): Promise<SaveMentorPageActionResult> {
  const mentor = await getCurrentMentor();
  const result = await saveMentorPageForSession({
    db: getPool(),
    mentor,
    input,
    publish,
    appUrl: mentor ? appBaseUrl() : "",
  });
  if (!result.ok) return result;
  // Tylko to, czego potrzebuje klient (bez `published`): link wtedy, gdy strona jest opublikowana.
  return result.shareUrl ? { ok: true, shareUrl: result.shareUrl } : { ok: true };
}
