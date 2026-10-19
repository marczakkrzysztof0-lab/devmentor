// Formatting shared by the product components. Polish UI (spec #16 Q6): amounts through
// Intl.NumberFormat('pl-PL'), times in the viewer's zone with its name (#16, #17).

/**
 * Money from minor units (grosze): 15000 → „150 zł”, 13450 → „134,50 zł”.
 * Whole amounts without „,00”; grosze shown whenever the amount is not whole, so a payout
 * after commission is never rounded (decision C1, 2026-10-19).
 */
export function formatMoney(minor: number, currency = "PLN") {
  const digits = minor % 100 === 0 ? 0 : 2;
  return new Intl.NumberFormat("pl-PL", {
    style: "currency",
    currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(minor / 100);
}

/** Resolves the viewer's zone; falls back to UTC when it is missing or invalid (spec #16). */
export function resolveTimeZone(timeZone?: string): { timeZone: string; fallback: boolean } {
  if (!timeZone) return { timeZone: "UTC", fallback: true };
  try {
    new Intl.DateTimeFormat("pl-PL", { timeZone }).format(0);
    return { timeZone, fallback: false };
  } catch {
    return { timeZone: "UTC", fallback: true };
  }
}

function dayKey(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

/** „18:00” in the given zone. */
export function formatTime(iso: string, timeZone: string) {
  return new Intl.DateTimeFormat("pl-PL", { timeZone, hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

/** „wtorek 20.10” — absolute, for screen-reader text and long labels. */
export function formatDateLong(iso: string, timeZone: string) {
  return new Intl.DateTimeFormat("pl-PL", { timeZone, weekday: "long", day: "numeric", month: "2-digit" })
    .format(new Date(iso))
    .replace(",", "");
}

/** „jutro, wtorek 20.10” or „czwartek 22.10”: the date always in text (spec #16). */
export function formatDayFull(iso: string, timeZone: string, now: Date) {
  const relative = formatDay(iso, timeZone, now);
  const absolute = formatDateLong(iso, timeZone);
  return relative === "dziś" || relative === "jutro" ? `${relative}, ${absolute}` : absolute;
}

/** „dziś”, „jutro” or „wt 20.10” — the day of a slot relative to `now`, in the given zone. */
export function formatDay(iso: string, timeZone: string, now: Date, style: "short" | "long" = "short") {
  const date = new Date(iso);
  const key = dayKey(date, timeZone);
  if (key === dayKey(now, timeZone)) return "dziś";
  if (key === dayKey(new Date(now.getTime() + 86_400_000), timeZone)) return "jutro";
  return new Intl.DateTimeFormat("pl-PL", {
    timeZone,
    weekday: style === "short" ? "short" : "long",
    day: "numeric",
    month: "2-digit",
  })
    .format(date)
    .replace(",", "");
}

/** „jutro 12:30–12:55” */
export function formatSlotRange(startIso: string, endIso: string, timeZone: string, now: Date) {
  return `${formatDay(startIso, timeZone, now)} ${formatTime(startIso, timeZone)}–${formatTime(endIso, timeZone)}`;
}

/** Key for grouping slots by local day. */
export function localDayKey(iso: string, timeZone: string) {
  return dayKey(new Date(iso), timeZone);
}

/** Host + path of a URL as the user will see it: „github.com/annak”. */
export function displayUrl(url: string) {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname === "/" ? "" : parsed.pathname.replace(/\/$/, "");
    return `${parsed.hostname.replace(/^www\./, "")}${path}`;
  } catch {
    return url;
  }
}
