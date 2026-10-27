// Formatowanie kwot i terminów do e-maili (spec #17 Q2). Strona `/r/{token}` formatuje w strefie widza przez DS;
// e-mail nie zna strefy odbiorcy, więc termin podajemy w strefie mentora z jej nazwą (jedna, jawna strefa).

/**
 * „150 zł”, „134,50 zł” (C1: grosze tylko, gdy kwota nie jest pełna). Spacje niełamiące → zwykłe (tekst e-maila).
 * @param {number} minor
 * @param {string} currency
 */
export function formatAmount(minor, currency) {
  const whole = minor % 100 === 0;
  return new Intl.NumberFormat("pl-PL", {
    style: "currency",
    currency,
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  })
    .format(minor / 100)
    .replace(/[  ]/g, " ");
}

/**
 * „śr. 28.10.2026, 12:30 (Europe/Warsaw)”.
 * @param {Date | string} instant
 * @param {string | null | undefined} timeZone  strefa mentora; brak → UTC
 */
export function formatWhen(instant, timeZone) {
  const zone = timeZone || "UTC";
  const formatted = new Intl.DateTimeFormat("pl-PL", {
    timeZone: zone,
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  })
    .format(new Date(instant))
    .replace(/[  ]/g, " ");
  return `${formatted} (${zone})`;
}

/**
 * Godzina „12:30” w strefie (termin decyzji mentora = start sesji).
 * @param {Date | string} instant
 * @param {string | null | undefined} timeZone
 */
export function formatClock(instant, timeZone) {
  return new Intl.DateTimeFormat("pl-PL", { timeZone: timeZone || "UTC", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(instant));
}
