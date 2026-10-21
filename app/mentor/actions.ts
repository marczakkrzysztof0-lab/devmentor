"use server";
// Server actions edytora /mentor (spec #14). Każda akcja sama sprawdza sesję (`getCurrentMentor()`), bo
// server action jest osiągalna bezpośrednim POST-em (data-security.md); id mentora nigdy nie przychodzi
// z klienta.
import { redirect } from "next/navigation";
import { signOutCurrentMentor } from "@/lib/auth/session";
import { saveCurrentMentorPage, type SaveMentorPageActionResult } from "@/lib/mentor-page/editor";

// „Wyloguj” w MentorNav (spec #14 `signOut()`, L7/Z8): odwołuje bieżącą sesję w bazie, usuwa ciasteczko
// i wraca na /mentor, gdzie bez sesji widać komunikat „Dostęp tylko przez zaproszenie…” (s03).
export async function signOutAction(): Promise<void> {
  await signOutCurrentMentor();
  redirect("/mentor");
}

/**
 * `saveMentorPage(fields, { publish })` (spec #14 API Contracts) w kształcie propa `action` komponentu DS
 * `MentorPageForm`: `(values: MentorPageValues, options: { publish: boolean })` — zwykły obiekt pól
 * (napisy; ceny w pełnych złotych), nie FormData. Argumenty są niezaufane: brane są tylko znane pola,
 * `publish` liczy się tylko jako `true`. Wynik: `{ ok: true, shareUrl? }` (link, gdy strona jest
 * opublikowana) | `{ ok: false, errors }` | `{ ok: false, reason: "unauthorized" }` (brak / wygasła /
 * odwołana sesja — nic nie zapisane; L6/Z7).
 */
export async function saveMentorPageAction(values: unknown, options: unknown): Promise<SaveMentorPageActionResult> {
  const publish =
    options !== null && typeof options === "object" && (options as { publish?: unknown }).publish === true;
  return saveCurrentMentorPage(values, publish);
}
