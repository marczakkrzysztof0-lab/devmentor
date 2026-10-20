// Dane demo (fikcyjne) z mapy ekranów, sekcja 3, i z briefu. Żadnych liczb użytkowników, ocen ani opinii.
import type { AvailabilityWindow, MentorPageValues, OpenSlot, SessionLength } from "@devmentor/ui/product";

/** Stały „teraz” demo: poniedziałek 19.10.2026, 19:00 Europe/Warsaw (mapa, sekcja 3; fixtures.ts). */
export const NOW_ISO = "2026-10-19T17:00:00Z";
export const DAY_MS = 86_400_000;
export const HORIZON_DAYS = 14; // #15: horyzont 14 dni
export const MIN_NOTICE_MS = 3 * 60 * 60 * 1000; // #15, D12: minimum 3 h wyprzedzenia
export const MAX_WINDOWS = 21; // #15 API: max 21 okien
export const BASE_URL = "http://localhost:3000";
export const DEFAULT_ZONE = "Europe/Warsaw"; // L15

export const INVITE_EXPIRES = "2.11.2026, 19:00"; // 14 dni (14-A1)
export const SIGN_IN_EXPIRES = "22.10.2026, 19:00"; // 72 h (L17)
export const PLACEHOLDER_SLUG = "mentor-q7k2ma"; // L9

export const ANNA_DESCRIPTION =
  "Migrowałam dwa duże projekty na server components. Wiem, gdzie zwykle pękają testy, cache i wycena takiej migracji.\nPomogę ci ocenić, czego jeszcze nie widzisz w swoim planie.";

/** Opis o maksymalnej długości 2000 znaków (16-A8), jak LONG_DESCRIPTION w fixtures Storybooka. */
export const LONG_DESCRIPTION = `${ANNA_DESCRIPTION}\n\n${"Prowadziłam migracje aplikacji z pages routera na app router, przepisywałam warstwę pobierania danych i ustawiałam cache tak, żeby testy dalej działały. ".repeat(14)}`.slice(0, 2000);

export const ANNA_VALUES: MentorPageValues = {
  displayName: "Anna K.",
  publicWorkUrl: "https://github.com/annak",
  description: ANNA_DESCRIPTION,
  price25: "150",
  price50: "280",
  slug: "anna-k",
};

export const EMPTY_VALUES: MentorPageValues = {
  displayName: "",
  publicWorkUrl: "",
  description: "",
  price25: "",
  price50: "",
  slug: PLACEHOLDER_SLUG,
};

/** Strona pomocnicza: Piotr N., opublikowana, bez okien (#15 story 3, #16 story 3, L18). */
export const PIOTR = {
  displayName: "Piotr N.",
  publicWorkUrl: "https://github.com/piotrn",
  description: "Utrzymuję klastry Kubernetes w małym zespole. Pomogę przejść przez upgrade ingress-nginx i konfigurację Helm.",
  price25Minor: 12000,
  price50Minor: 22000,
};

/** Okna Anny: wtorek 18:00–20:00, czwartek 12:00–13:00 (#15 story 1). Dni 0–6, pon = 0 (DS, luka D8). */
export const ANNA_WINDOWS: AvailabilityWindow[] = [
  { weekday: 1, start: "18:00", end: "20:00" },
  { weekday: 3, start: "12:00", end: "13:00" },
];

/** C8 „okna tylko w oknie 3 h”: dziś 19:00–21:30, więc dzisiejsze terminy odpadają przez 3 h wyprzedzenia. */
export const SHORT_NOTICE_WINDOWS: AvailabilityWindow[] = [{ weekday: 0, start: "19:00", end: "21:30" }];

/** C9 „22 okna”: o jedno za dużo (L16). */
export const TOO_MANY_WINDOWS: AvailabilityWindow[] = Array.from({ length: 22 }, (_, i) => {
  const weekday = (i % 7) as AvailabilityWindow["weekday"];
  const hour = 8 + Math.floor(i / 7) * 3;
  return { weekday, start: `${String(hour).padStart(2, "0")}:00`, end: `${String(hour + 1).padStart(2, "0")}:00` };
});

export const ZONES = [
  {
    label: "Europa",
    options: [
      { value: "Europe/Warsaw", label: "Warszawa (Europe/Warsaw)" },
      { value: "Europe/London", label: "Londyn (Europe/London)" },
      { value: "Europe/Berlin", label: "Berlin (Europe/Berlin)" },
    ],
  },
  { label: "Inne", options: [{ value: "UTC", label: "UTC" }] },
];

/* ----------------------------------------------------------- czas i strefy */

function zoneOffsetMs(utcMs: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(utcMs));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - utcMs;
}

/** Czas ścienny w strefie → UTC (obsługuje zmianę czasu 25.10.2026). */
export function zonedToUtc(date: string, time: string, timeZone: string) {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  let result = guess - zoneOffsetMs(guess, timeZone);
  result = guess - zoneOffsetMs(result, timeZone);
  return result;
}

function localDate(utcMs: number, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(utcMs));
}

/** Dzień tygodnia 0–6 (pon = 0) daty YYYY-MM-DD. */
function weekdayOf(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

/** Terminy z okien (#15): siatka :00/:30, 3 h wyprzedzenia, horyzont 14 dni, 25 i/lub 50 min, które się mieszczą. */
export function slotsFromWindows(windows: AvailabilityWindow[], timeZone: string, now: Date): OpenSlot[] {
  const nowMs = now.getTime();
  const earliest = nowMs + MIN_NOTICE_MS;
  const horizon = nowMs + HORIZON_DAYS * DAY_MS;
  const slots: OpenSlot[] = [];
  for (let day = 0; day <= HORIZON_DAYS + 1; day++) {
    const date = localDate(nowMs + day * DAY_MS, timeZone);
    const weekday = weekdayOf(date);
    for (const window of windows.filter((w) => w.weekday === weekday)) {
      const start = zonedToUtc(date, window.start, timeZone);
      const end = window.end === "24:00" ? zonedToUtc(date, "23:30", timeZone) + 30 * 60_000 : zonedToUtc(date, window.end, timeZone);
      for (let t = start; t < end; t += 30 * 60_000) {
        if (t < earliest || t >= horizon) continue;
        for (const length of [25, 50] as SessionLength[]) {
          if (t + length * 60_000 <= end) slots.push({ startsAt: new Date(t).toISOString(), lengthMinutes: length });
        }
      }
    }
  }
  const unique = new Map(slots.map((s) => [`${s.startsAt}|${s.lengthMinutes}`, s]));
  return [...unique.values()].sort((a, b) => a.startsAt.localeCompare(b.startsAt) || a.lengthMinutes - b.lengthMinutes);
}

/** Strefa przeglądarki z kontrolki C10; `undefined` = przeglądarka jej nie podaje. */
export function browserZone(choice: "warsaw" | "london" | "none") {
  return choice === "warsaw" ? "Europe/Warsaw" : choice === "london" ? "Europe/London" : undefined;
}

export function toMinor(price: string) {
  const n = Number(price);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

export const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
