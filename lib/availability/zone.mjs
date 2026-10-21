// Strefy czasowe mentora bez nowych zależności — tylko Intl (spec #15, Proposed Solution „Zone conversion”, Q2, Z16).
//
// Czysty moduł (bez bazy). Czas ścienny w strefie IANA ↔ chwile UTC, poprawnie przez zmiany czasu (DST):
// offset strefy liczymy z `Intl.DateTimeFormat#formatToParts` i sondujemy go wokół szukanej chwili.
//
// Decyzje (zadanie 4.2):
// - „Obsługiwana strefa” = nazwa przyjmowana przez `Intl.DateTimeFormat`, której kanoniczna postać
//   (`resolvedOptions().timeZone`) jest na liście `Intl.supportedValuesOf('timeZone')` ALBO jest „UTC”.
//   Lista w Node 24 (ICU) NIE zawiera „UTC” ani „Etc/UTC” (to aliasy, nie strefy regionalne), a przeglądarka
//   na maszynie ustawionej na UTC zgłasza właśnie „UTC” — odrzucenie wymusiłoby po cichu Europe/Warsaw.
// - Aliasy są przyjmowane i sprowadzane do nazwy kanonicznej z listy: Firefox zgłasza „Europe/Kyiv”,
//   a lista Node 24 ma „Europe/Kiev” (podobnie Asia/Kolkata → Asia/Calcutta, „Poland” → Europe/Warsaw).
//   `canonicalTimeZone` zwraca nazwę do zapisu, zgodną z listą wyboru w edytorze.
// - Przesunięcia typu „+01:00” i „Etc/GMT-2” (bez reguł DST, spoza listy) nie są obsługiwane.

/** Strefa domyślna, gdy przeglądarka nie podała strefy lub podała nieobsługiwaną (L15, Z16). */
export const DEFAULT_TIME_ZONE = "Europe/Warsaw";

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;

/** @type {Set<string> | null} */
let supportedCache = null;
function supportedSet() {
  if (!supportedCache) supportedCache = new Set(Intl.supportedValuesOf("timeZone"));
  return supportedCache;
}

/** @type {Map<string, Intl.DateTimeFormat>} */
const formatters = new Map();
/** @param {string} timeZone */
function formatterFor(timeZone) {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
      weekday: "short",
    });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

/**
 * Kanoniczna nazwa obsługiwanej strefy albo `null` (nieznana, pusta, przesunięcie, spoza listy).
 * @param {unknown} timeZone
 * @returns {string | null}
 */
export function canonicalTimeZone(timeZone) {
  if (typeof timeZone !== "string" || !/^[A-Za-z]/.test(timeZone.trim())) return null;
  let resolved;
  try {
    resolved = new Intl.DateTimeFormat("en-US", { timeZone: timeZone.trim() }).resolvedOptions().timeZone;
  } catch {
    return null;
  }
  if (resolved === "UTC" || supportedSet().has(resolved)) return resolved;
  return null;
}

/**
 * Czy strefę można zapisać jako strefę mentora (lista `Intl.supportedValuesOf('timeZone')`, jej aliasy oraz UTC).
 * @param {unknown} timeZone
 */
export function isSupportedTimeZone(timeZone) {
  return canonicalTimeZone(timeZone) !== null;
}

/**
 * Strefa mentora: kanoniczna postać kandydata (np. strefy z przeglądarki), a gdy brak/nieobsługiwana — Europe/Warsaw (Z16).
 * @param {unknown} candidate
 * @returns {string}
 */
export function resolveMentorTimeZone(candidate) {
  return canonicalTimeZone(candidate) ?? DEFAULT_TIME_ZONE;
}

const WEEKDAYS = /** @type {Record<string, number>} */ ({ Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 });

/**
 * Lokalna data i godzina chwili w strefie.
 * @param {Date | number | string} instant
 * @param {string} timeZone
 * @returns {{ year: number, month: number, day: number, weekday: number, hour: number, minute: number, second: number }}
 *   `month` 1–12, `weekday` ISO 1–7 (poniedziałek = 1), `hour` 0–23.
 */
export function localDateParts(instant, timeZone) {
  const ms = toMs(instant);
  /** @type {Record<string, string>} */
  const parts = {};
  for (const part of formatterFor(timeZone).formatToParts(ms)) parts[part.type] = part.value;
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    weekday: WEEKDAYS[parts.weekday],
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

/** Czas ścienny chwili zapisany jako „naiwne” ms (jakby strefa była UTC). */
function wallMs(ms, timeZone) {
  const p = localDateParts(ms, timeZone);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
}

/** Offset strefy w chwili `ms` (ms; dodatni na wschód od Greenwich). */
function offsetAt(ms, timeZone) {
  const whole = Math.floor(ms / 1000) * 1000;
  return wallMs(whole, timeZone) - whole;
}

// Punkty sondowania offsetu wokół szukanego czasu ściennego (zmiany offsetu dzielą dziesiątki dni, więc
// ±2 doby wystarcza z zapasem, także przy offsetach do ±14 h).
const PROBES = [-2 * DAY_MS, -DAY_MS, -DAY_MS / 2, 0, DAY_MS / 2, DAY_MS, 2 * DAY_MS];

/**
 * Wszystkie chwile UTC, które w strefie wyglądają jak dany czas ścienny, rosnąco:
 * 0 — czas w luce wiosennej zmiany czasu, 2 — czas powtórzony przy jesiennej zmianie, 1 — zwykle.
 * `minuteOfDay` może wynosić 1440 (= północ następnego dnia; koniec okna 24:00).
 * @param {number} year
 * @param {number} month 1–12
 * @param {number} day
 * @param {number} minuteOfDay 0–1440
 * @param {string} timeZone
 * @returns {Date[]}
 */
export function zonedWallTimeToInstants(year, month, day, minuteOfDay, timeZone) {
  const naive = Date.UTC(year, month - 1, day, 0, minuteOfDay);
  const offsets = new Set(PROBES.map((delta) => offsetAt(naive + delta, timeZone)));
  /** @type {Set<number>} */
  const instants = new Set();
  for (const offset of offsets) {
    const candidate = naive - offset;
    if (wallMs(candidate, timeZone) === naive) instants.add(candidate);
  }
  return [...instants].sort((a, b) => a - b).map((ms) => new Date(ms));
}

/**
 * Pierwsza chwila, w której zegar ścienny pokazuje co najmniej dany czas — dla końca okna.
 * Zwykle = jedyna chwila; przy powtórzonym czasie = pierwsze wystąpienie; w luce = moment przestawienia
 * zegara (np. koniec 02:30 w dniu 2026-03-29 w Warszawie → 03:00 CEST = 01:00 UTC).
 * @param {number} year
 * @param {number} month
 * @param {number} day
 * @param {number} minuteOfDay
 * @param {string} timeZone
 * @returns {number} ms UTC
 */
export function zonedWallTimeLowerBound(year, month, day, minuteOfDay, timeZone) {
  const exact = zonedWallTimeToInstants(year, month, day, minuteOfDay, timeZone);
  if (exact.length > 0) return exact[0].getTime();
  // Luka: przejście leży między (naive − offset po zmianie) a (naive − offset przed zmianą).
  const naive = Date.UTC(year, month - 1, day, 0, minuteOfDay);
  const offsets = PROBES.map((delta) => offsetAt(naive + delta, timeZone));
  let low = naive - Math.max(...offsets); // zegar jeszcze przed szukanym czasem
  let high = naive - Math.min(...offsets); // zegar już za nim
  while (high - low > 1000) {
    const mid = Math.floor((low + high) / 2000) * 1000;
    if (wallMs(mid, timeZone) >= naive) high = mid;
    else low = mid;
  }
  return high;
}

/**
 * @param {Date | number | string} value
 * @returns {number}
 */
export function toMs(value) {
  const ms = value instanceof Date ? value.getTime() : typeof value === "number" ? value : Date.parse(value);
  if (!Number.isFinite(ms)) throw new TypeError(`Nieprawidłowa chwila: ${String(value)}`);
  return ms;
}

export { MINUTE_MS, DAY_MS };

/** Polskie nazwy grup listy stref (pierwszy człon nazwy IANA); reszta trafia do „Inne”. */
const REGION_LABELS = /** @type {const} */ ([
  ["Europe", "Europa"],
  ["America", "Ameryka"],
  ["Asia", "Azja"],
  ["Africa", "Afryka"],
  ["Australia", "Australia"],
  ["Pacific", "Pacyfik"],
  ["Atlantic", "Atlantyk"],
  ["Indian", "Ocean Indyjski"],
  ["Antarctica", "Antarktyka"],
  ["Arctic", "Arktyka"],
]);
const OTHER_LABEL = "Inne";

/**
 * Lista wyboru strefy dla edytora dostępności (DS `AvailabilityEditor zones`): dokładnie nazwy, które serwer
 * przyjmuje bez zmiany — `Intl.supportedValuesOf('timeZone')` tego procesu (Node) plus „UTC” — w grupach
 * według regionu, alfabetycznie. Każda wartość spełnia `canonicalTimeZone(v) === v`, więc to, co mentor wybierze,
 * zapisze się pod tą samą nazwą i po odświeżeniu będzie zaznaczone na liście.
 * @returns {{ label: string, options: { value: string, label: string }[] }[]}
 */
export function timeZoneOptions() {
  /** @type {Map<string, string[]>} */
  const groups = new Map([...REGION_LABELS.map(([, label]) => [label, []]), [OTHER_LABEL, []]]);
  const regionLabel = new Map(REGION_LABELS);
  for (const zone of [...supportedSet(), "UTC"]) {
    const label = regionLabel.get(zone.split("/")[0]) ?? OTHER_LABEL;
    groups.get(label)?.push(zone);
  }
  return [...groups.entries()]
    .filter(([, zones]) => zones.length > 0)
    .map(([label, zones]) => ({
      label,
      options: zones.sort((a, b) => a.localeCompare(b, "en")).map((zone) => ({ value: zone, label: zone.replaceAll("_", " ") })),
    }));
}
