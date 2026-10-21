// Slot days in the VIEWER's zone (spec #16 Q7/F3, UI/UX), used IDENTICALLY by the DS `SlotList`
// (`src/product/e01/SharePage.tsx`, through `src/product/shared/format.ts`) and by `node --test`
// (`tests/availability/group-slots.test.mjs`, imported as `@devmentor/ui/slots`). Plain ESM + JSDoc (no TS, no
// React) so node imports it without a loader; keep it dependency-free.
//
// Polish UI: times „18:00”, days „dziś” / „jutro” / „czw. 22.10”; the date is always in the text of a time
// („jutro, wtorek 20.10, 18:00”), not only in the grouping (spec #16 accessibility).

/** At most this many times per day are shown before „Pokaż więcej (k)” (spec #16 F3: N = 6). */
export const SLOTS_PER_DAY = 6;

/**
 * The viewer's zone; missing or not understood by `Intl` → UTC with `fallback: true`, so the UI labels it „UTC”.
 * @param {string | null} [timeZone]
 * @returns {{ timeZone: string, fallback: boolean }}
 */
export function resolveTimeZone(timeZone) {
  if (!timeZone) return { timeZone: "UTC", fallback: true };
  try {
    new Intl.DateTimeFormat("pl-PL", { timeZone }).format(0);
    return { timeZone, fallback: false };
  } catch {
    return { timeZone: "UTC", fallback: true };
  }
}

/**
 * @param {Date} date
 * @param {string} timeZone
 */
function dayKeyOf(date, timeZone) {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

/**
 * Key of the local day of an instant: „2026-10-22”.
 * @param {string} iso
 * @param {string} timeZone
 * @returns {string}
 */
export function localDayKey(iso, timeZone) {
  return dayKeyOf(new Date(iso), timeZone);
}

/**
 * „18:00” in the given zone.
 * @param {string} iso
 * @param {string} timeZone
 * @returns {string}
 */
export function formatTime(iso, timeZone) {
  return new Intl.DateTimeFormat("pl-PL", { timeZone, hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

/**
 * „wtorek 20.10” — absolute, for screen-reader text and long labels.
 * @param {string} iso
 * @param {string} timeZone
 * @returns {string}
 */
export function formatDateLong(iso, timeZone) {
  return new Intl.DateTimeFormat("pl-PL", { timeZone, weekday: "long", day: "numeric", month: "2-digit" })
    .format(new Date(iso))
    .replace(",", "");
}

/**
 * „dziś”, „jutro” or „wt. 20.10” — the day of a slot relative to `now`, in the given zone.
 * @param {string} iso
 * @param {string} timeZone
 * @param {Date} now
 * @param {"short" | "long"} [style]
 * @returns {string}
 */
export function formatDay(iso, timeZone, now, style = "short") {
  const date = new Date(iso);
  const key = dayKeyOf(date, timeZone);
  if (key === dayKeyOf(now, timeZone)) return "dziś";
  if (key === dayKeyOf(new Date(now.getTime() + 86_400_000), timeZone)) return "jutro";
  return new Intl.DateTimeFormat("pl-PL", {
    timeZone,
    weekday: style === "short" ? "short" : "long",
    day: "numeric",
    month: "2-digit",
  })
    .format(date)
    .replace(",", "");
}

/**
 * „jutro, wtorek 20.10” or „czwartek 22.10”: the date always in text (spec #16).
 * @param {string} iso
 * @param {string} timeZone
 * @param {Date} now
 * @returns {string}
 */
export function formatDayFull(iso, timeZone, now) {
  const relative = formatDay(iso, timeZone, now);
  const absolute = formatDateLong(iso, timeZone);
  return relative === "dziś" || relative === "jutro" ? `${relative}, ${absolute}` : absolute;
}

/**
 * @typedef {{ startsAt: string, lengthMinutes: number }} Slot
 * @typedef {{ startsAt: string, label: string, fullLabel: string }} SlotTime
 *   `label` „18:00”; `fullLabel` with the date in text: „jutro, wtorek 20.10, 18:00”.
 * @typedef {{
 *   dayKey: string,
 *   dayLabel: string,
 *   dayLabelFull: string,
 *   times: SlotTime[],
 *   visible: SlotTime[],
 *   hiddenCount: number,
 * }} SlotDay
 *   `dayLabel` „jutro” / „czw. 22.10” (the h3); `dayLabelFull` „jutro, wtorek 20.10”; `visible` = the first
 *   `maxPerDay` times, `hiddenCount` = the rest (k in „Pokaż więcej (k)”).
 * @typedef {{ timeZone: string, fallback: boolean, days: SlotDay[] }} SlotDays
 */

/**
 * Slots of one length grouped by the VIEWER's local day, earliest first (spec #16 Q7/F3). Each day once, its
 * times in order; at most `maxPerDay` visible, the rest counted in `hiddenCount`. A missing or invalid zone → UTC
 * with `fallback: true` (the UI then prints „UTC” instead of the zone).
 * @param {Slot[]} slots
 * @param {{ lengthMinutes?: number, timeZone?: string | null, now?: Date, maxPerDay?: number }} [options]
 *   `lengthMinutes` omitted → every slot; `now` → „dziś” / „jutro”; `maxPerDay` default 6.
 * @returns {SlotDays}
 */
export function groupSlotsByDay(slots, { lengthMinutes, timeZone, now = new Date(), maxPerDay = SLOTS_PER_DAY } = {}) {
  const zone = resolveTimeZone(timeZone);
  const tz = zone.timeZone;
  const chosen = slots
    .filter((slot) => lengthMinutes === undefined || slot.lengthMinutes === lengthMinutes)
    .toSorted((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));

  /** @type {Map<string, SlotDay>} */
  const days = new Map();
  for (const slot of chosen) {
    const dayKey = localDayKey(slot.startsAt, tz);
    let day = days.get(dayKey);
    if (!day) {
      day = {
        dayKey,
        dayLabel: formatDay(slot.startsAt, tz, now),
        dayLabelFull: formatDayFull(slot.startsAt, tz, now),
        times: [],
        visible: [],
        hiddenCount: 0,
      };
      days.set(dayKey, day);
    }
    const label = formatTime(slot.startsAt, tz);
    day.times.push({ startsAt: slot.startsAt, label, fullLabel: `${day.dayLabelFull}, ${label}` });
  }
  for (const day of days.values()) {
    day.visible = day.times.slice(0, Math.max(0, maxPerDay));
    day.hiddenCount = day.times.length - day.visible.length;
  }
  return { timeZone: tz, fallback: zone.fallback, days: [...days.values()] };
}
