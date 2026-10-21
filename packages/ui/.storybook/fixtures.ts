// Story data taken from the specs (#14–#19) and the brief. Storybook only — never exported.
// "Now" is Monday 19.10.2026 19:00 Europe/Warsaw, as in spec #15 story 4.
import type { MentorPublicPage, OpenSlot, SessionLength } from "../src/product/shared/types";

export const NOW = new Date("2026-10-19T17:00:00Z");
export const ZONE = "Europe/Warsaw";

export const ANNA: MentorPublicPage = {
  displayName: "Anna K.",
  publicWorkUrl: "https://github.com/annak",
  description:
    "Migrowałam dwa duże projekty na server components. Wiem, gdzie zwykle pękają testy, cache i wycena takiej migracji.\nPomogę ci ocenić, czego jeszcze nie widzisz w swoim planie.",
  price25Minor: 15000,
  price50Minor: 28000,
  currency: "PLN",
  slug: "anna-k",
};

/** A 2000-character description: the maximum allowed by spec #14. */
export const LONG_DESCRIPTION = `${ANNA.description}\n\n${"Prowadziłam migracje aplikacji z pages routera na app router, przepisywałam warstwę pobierania danych i ustawiałam cache tak, żeby testy dalej działały. ".repeat(14)}`.slice(0, 2000);

/** Converts a Warsaw wall-clock time to UTC ISO (CEST until 25.10.2026, then CET). */
export function warsaw(date: string, time: string) {
  const offset = date < "2026-10-25" ? "+02:00" : "+01:00";
  return new Date(`${date}T${time}:00${offset}`).toISOString();
}

function addMinutes(iso: string, minutes: number) {
  return new Date(new Date(iso).getTime() + minutes * 60_000).toISOString();
}

/** Slots from windows: each :00/:30 start that fits 25 and/or 50 minutes (#15). */
export function slotsFromWindows(windows: { date: string; from: string; to: string }[]): OpenSlot[] {
  const slots: OpenSlot[] = [];
  for (const window of windows) {
    const end = warsaw(window.date, window.to);
    for (let start = warsaw(window.date, window.from); start < end; start = addMinutes(start, 30)) {
      for (const length of [25, 50] as SessionLength[]) {
        if (addMinutes(start, length) <= end) slots.push({ startsAt: start, lengthMinutes: length });
      }
    }
  }
  return slots;
}

/** Anna: Tuesday 18:00–20:00 and Thursday 12:00–13:00 (spec #15 story 1), next 14 days. */
export const ANNA_SLOTS = slotsFromWindows([
  { date: "2026-10-20", from: "18:00", to: "20:00" },
  { date: "2026-10-22", from: "12:00", to: "13:00" },
  { date: "2026-10-27", from: "18:00", to: "20:00" },
  { date: "2026-10-29", from: "12:00", to: "13:00" },
  { date: "2026-11-03", from: "18:00", to: "20:00" },
]);

/**
 * F3 criterion (spec #16 Q7): 25 min → 10 slots on Tuesday 20.10 („jutro”) and 2 on Thursday 22.10;
 * 50 min → 9 and 1 (12:00–17:00 and 18:00–19:00).
 */
export const F3_SLOTS = slotsFromWindows([
  { date: "2026-10-20", from: "12:00", to: "17:00" },
  { date: "2026-10-22", from: "18:00", to: "19:00" },
]);

/** Only 30-minute windows: every slot fits 25 min, none fits 50 (the empty 50-min list, task 6.2). */
export const ONLY_25_SLOTS = slotsFromWindows([
  { date: "2026-10-20", from: "18:00", to: "18:30" },
  { date: "2026-10-22", from: "12:00", to: "12:30" },
]);

/** Many slots: windows every weekday 9:00–17:00 for two weeks (the "lots of data" state). */
export const MANY_SLOTS = slotsFromWindows(
  ["2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23", "2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", "2026-11-02"].map(
    (date) => ({ date, from: "09:00", to: "17:00" }),
  ),
);

export const QUESTION =
  "Migruję aplikację na server components i jutro wysyłam wycenę. Po przeniesieniu strony produktu testy w Jest przestały widzieć fetch z cache. Co zwykle trzeba zmienić w konfiguracji i w mockach?\n\n```\nexport default async function Page() {\n  const product = await fetch(\"/api/product\", { cache: \"force-cache\" }).then((r) => r.json());\n  return <ProductView product={product} />;\n}\n```\n\nCzy da się to oszacować w dniach?";

export const SHARE_URL = "http://localhost:3000/m/anna-k";
export const REQUEST_URL = "http://localhost:3000/r/Qm9va2luZy1saW5rLWZvci1rdWJhLTI1LW1pbg";

/** Resolves after `ms` (simulates the network for server-action stories). */
export const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** A promise that never settles: the "waiting for the server" state. */
export const never = <T,>() => new Promise<T>(() => {});
