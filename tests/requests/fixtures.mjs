// Dane testowe zapytań (to nie jest plik testowy): opublikowany mentor z dostępnością (funkcjami domeny, jak e2e),
// zależności `startRequest` z fałszywym Stripe i prawdziwym subskrybentem zapytań.
import { randomUUID } from "node:crypto";
import { acceptInvitation } from "../../lib/auth/mentor-auth.mjs";
import { listOpenSlotsForMentor } from "../../lib/availability/queries.mjs";
import { saveAvailability } from "../../lib/availability/save.mjs";
import { saveMentorPage } from "../../lib/mentor-page/mentor-page.mjs";
import { requestPaymentSubscriber } from "../../lib/requests/payment-subscriber.mjs";
import { resolveRequestCheckout } from "../../lib/requests/start.mjs";
import { createInvitation } from "../../scripts/mentor-links.mjs";
import { makeDeps } from "../payments/helpers.mjs";

export const APP_URL = "http://localhost:3000";
process.env.NEXT_PUBLIC_APP_URL ??= APP_URL;

export const QUESTION = "Mam błąd hydracji po przejściu na app router — co sprawdzić najpierw? Termin jutro.";
/** Codziennie 08:00–22:00 czasu mentora. */
export const DAILY = [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ weekday, startMinute: 8 * 60, endMinute: 22 * 60 }));

let counter = 0;

/** Opublikowany mentor (25 min — 150 zł, 50 min — 280 zł) z oknami codziennie 8–22 Europe/Warsaw. */
export async function seedMentor(db, { slug = `mentor-${Date.now().toString(36)}-${++counter}` } = {}) {
  const email = `req-${Date.now()}-${++counter}@example.com`;
  const { url } = await createInvitation({ db: db.pool, email, appUrl: APP_URL });
  const accepted = await acceptInvitation({ db: db.pool, token: url.slice(url.lastIndexOf("/") + 1) });
  const input = { displayName: "Anna K.", publicWorkUrl: "https://github.com/anna", description: "Next.js, migracje i code review.", price25: "150", price50: "280", slug };
  const saved = await saveMentorPage({ db: db.pool, mentorId: accepted.mentorId, input, publish: true, appUrl: APP_URL });
  if (!saved.ok) throw new Error(JSON.stringify(saved));
  await saveAvailability({ db: db.pool, mentorId: accepted.mentorId, input: { timeZone: "Europe/Warsaw", windows: DAILY } });
  return { mentorId: accepted.mentorId, slug, email };
}

/** Wolne terminy mentora teraz (bez zajętych). */
export const openSlots = (db, mentorId, now = new Date()) => listOpenSlotsForMentor({ db: db.pool, mentorId, now });

/** Zależności `startRequest` z fałszywym Stripe; subskrybent zapytań + rejestrator zdarzeń. */
export function makeRequestDeps(db) {
  const ctx = makeDeps(db, { start: new Date() });
  const recorder = ctx.deps.subscribers[0];
  ctx.deps.subscribers = [requestPaymentSubscriber, recorder];
  ctx.deps.resolveCheckoutRequest = resolveRequestCheckout;
  const startDeps = { db: db.pool, payments: ctx.deps, appUrl: APP_URL, now: ctx.deps.now };
  return { ...ctx, startDeps };
}

/** Poprawne wejście formularza dla terminu. */
export function formInput({ slug, slot, lengthMinutes = 25, amount = lengthMinutes === 25 ? 15000 : 28000, submissionId = randomUUID(), ...rest }) {
  return { slug, submissionId, lengthMinutes, slotStart: slot.startsAt, expectedAmountMinor: amount, menteeName: "Kuba", question: QUESTION, ...rest };
}
