// Nazwy radiów godzin na /m/[slug] (DS `SlotList`, F4) — jedno miejsce na wyrażenie, którym e2e szuka radia
// po dacie i godzinie. Czysty moduł (bez Playwrighta), żeby test jednostkowy
// (`tests/availability/slot-radio-names.test.mjs`) sprawdzał go z zamrożonym zegarem dla wielu dat granicznych.
//
// Lekcja 17: błąd, który wrócił mimo review (PR #49) — `${date}.*${time}` dla „1.11” trafiało też w „11.11, 17:00”,
// gdy oba dni były w 14-dniowym oknie; wynik zależał od dnia uruchomienia. Reguła
// `scripts/check-date-selectors.mjs` pilnuje, żeby e2e nie budowały takich wyrażeń obok tego modułu.

/** „…, 1.11, 17:00” → { date: "1.11", time: "17:00" }; null, gdy nazwa nie kończy się datą i godziną. */
export function slotDateTime(name) {
  const [, date, time] = name.match(/(\d{1,2}\.\d{2}),\s*(\d{2}:\d{2})$/) ?? [];
  return date && time ? { date, time } : null;
}

/**
 * Wyrażenie na nazwę radia z tą datą i godziną: data jako całe słowo (bez cyfry przed nią) i para „data, godzina”
 * na końcu nazwy — „1.11, 17:00” nie trafia w „11.11, 17:00” ani w „21.11, 17:00”.
 * @param {string} date „1.11”
 * @param {string} time „17:00”
 */
export function slotRadioNamePattern(date, time) {
  return new RegExp(`(?<!\\d)${date.replace(".", "\\.")},\\s*${time}$`);
}
