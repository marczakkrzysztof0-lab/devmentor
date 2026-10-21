"use server";
// „Wyloguj” w MentorNav (spec #14 `signOut()`, L7/Z8): odwołuje bieżącą sesję w bazie, usuwa ciasteczko
// i wraca na /mentor, gdzie bez sesji widać komunikat „Dostęp tylko przez zaproszenie…” (s03).
import { redirect } from "next/navigation";
import { signOutCurrentMentor } from "@/lib/auth/session";

export async function signOutAction(): Promise<void> {
  await signOutCurrentMentor();
  redirect("/mentor");
}
