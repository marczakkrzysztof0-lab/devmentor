// Formatting shared by the product components. Polish UI (spec #16 Q6): amounts through
// Intl.NumberFormat('pl-PL'), times in the viewer's zone with its name (#16, #17).

import { formatDay, formatTime } from "../../lib/slot-days.mjs";

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

// Zone and day/time formatting live in a plain `.mjs` shared with `node --test` (`@devmentor/ui/slots`), so the
// slot grouping of `SlotList` and its unit tests run the same code (spec #16 F3).

export {
  formatDateLong,
  formatDay,
  formatDayFull,
  formatTime,
  groupSlotsByDay,
  localDayKey,
  resolveTimeZone,
  SLOTS_PER_DAY,
} from "../../lib/slot-days.mjs";

/** „jutro 12:30–12:55” */
export function formatSlotRange(startIso: string, endIso: string, timeZone: string, now: Date) {
  return `${formatDay(startIso, timeZone, now)} ${formatTime(startIso, timeZone)}–${formatTime(endIso, timeZone)}`;
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
