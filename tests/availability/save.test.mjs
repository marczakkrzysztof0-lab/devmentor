// Testy jednostkowe zapisu dostępności (bez bazy): walidacja wejścia, mapowanie kształtu DS (luka D8),
// podgląd, `unauthorized` bez sesji (L6/Z7). Zapis z bazą: tests/db/availability-save.test.mjs.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  formatTime,
  fromEditorInput,
  fromEditorWindows,
  MAX_WINDOWS,
  MESSAGES,
  parseTime,
  previewSlots,
  saveAvailabilityForSession,
  toEditorWindows,
  validateAvailabilityInput,
} from "../../lib/availability/save.mjs";
import { canonicalTimeZone } from "../../lib/availability/zone.mjs";

const TUESDAY = { weekday: 2, startMinute: 1080, endMinute: 1200 };

describe("validateAvailabilityInput", () => {
  test("poprawne wejście: strefa kanoniczna, tylko znane pola okien", () => {
    const result = validateAvailabilityInput({
      timeZone: "Europe/Kyiv",
      windows: [{ ...TUESDAY, id: "x", mentorId: "b" }, { weekday: 7, startMinute: 1410, endMinute: 1440 }],
      mentorId: "b",
    });
    assert.deepEqual(result, {
      ok: true,
      values: {
        timeZone: canonicalTimeZone("Europe/Kyiv"),
        windows: [TUESDAY, { weekday: 7, startMinute: 1410, endMinute: 1440 }],
      },
    });
  });

  test("pusta lista okien jest poprawna (mentor usuwa całą dostępność)", () => {
    assert.deepEqual(validateAvailabilityInput({ timeZone: "UTC", windows: [] }), {
      ok: true,
      values: { timeZone: "UTC", windows: [] },
    });
  });

  test("strefa nieobsługiwana / pusta / brak → errors.timeZone", () => {
    for (const timeZone of ["Mars/Olympus", "+01:00", "Etc/GMT-2", "", "   ", 7, null, undefined]) {
      const result = validateAvailabilityInput({ timeZone, windows: [] });
      assert.deepEqual(result, { ok: false, errors: { timeZone: MESSAGES.timeZone } }, String(timeZone));
    }
  });

  test("błędy okien przy indeksie: dzień, siatka, zakres, koniec po początku, nie-obiekt", () => {
    const result = validateAvailabilityInput({
      timeZone: "Europe/Warsaw",
      windows: [
        TUESDAY,
        { weekday: 0, startMinute: 600, endMinute: 660 },
        { weekday: 8, startMinute: 600, endMinute: 660 },
        { weekday: 1.5, startMinute: 600, endMinute: 660 },
        { weekday: "1", startMinute: 600, endMinute: 660 },
        { weekday: 1, startMinute: 615, endMinute: 660 },
        { weekday: 1, startMinute: 600, endMinute: 1470 },
        { weekday: 1, startMinute: -30, endMinute: 60 },
        { weekday: 1, startMinute: "600", endMinute: 660 },
        { weekday: 1, startMinute: 660, endMinute: 660 },
        { weekday: 1, startMinute: 690, endMinute: 660 },
        null,
        [1, 600, 660],
        { weekday: 1, startMinute: 1440, endMinute: 1440 },
      ],
    });
    assert.deepEqual(result, {
      ok: false,
      errors: {
        "windows.1": MESSAGES.weekday,
        "windows.2": MESSAGES.weekday,
        "windows.3": MESSAGES.weekday,
        "windows.4": MESSAGES.weekday,
        "windows.5": MESSAGES.grid,
        "windows.6": MESSAGES.grid,
        "windows.7": MESSAGES.grid,
        "windows.8": MESSAGES.grid,
        "windows.9": MESSAGES.endAfterStart,
        "windows.10": MESSAGES.endAfterStart,
        "windows.11": MESSAGES.window,
        "windows.12": MESSAGES.window,
        "windows.13": MESSAGES.endAfterStart,
      },
    });
  });

  test("21 okien OK; 22 → „Maksymalnie 21 okien w tygodniu” (okna nie są wtedy oceniane)", () => {
    assert.equal(MAX_WINDOWS, 21);
    const window = { weekday: 1, startMinute: 600, endMinute: 660 };
    assert.equal(validateAvailabilityInput({ timeZone: "UTC", windows: Array(21).fill(window) }).ok, true);
    assert.deepEqual(validateAvailabilityInput({ timeZone: "UTC", windows: Array(22).fill(null) }), {
      ok: false,
      errors: { windows: "Maksymalnie 21 okien w tygodniu" },
    });
  });

  test("brak listy okien / nie-tablica / nie-obiekt wejścia → errors.windows (i strefa)", () => {
    assert.deepEqual(validateAvailabilityInput({ timeZone: "UTC", windows: "x" }), {
      ok: false,
      errors: { windows: MESSAGES.windowsList },
    });
    assert.deepEqual(validateAvailabilityInput(null), {
      ok: false,
      errors: { timeZone: MESSAGES.timeZone, windows: MESSAGES.windowsList },
    });
    // Odziedziczone właściwości nie są brane.
    assert.equal(validateAvailabilityInput(Object.create({ timeZone: "UTC", windows: [] })).ok, false);
  });
});

describe("mapowanie kształtu DS (luka D8: dzień 0–6, poniedziałek = 0; „HH:MM”)", () => {
  test("parseTime / formatTime: 00:00–24:00, 1440 ↔ „24:00”", () => {
    assert.equal(parseTime("00:00"), 0);
    assert.equal(parseTime("18:30"), 1110);
    assert.equal(parseTime("24:00"), 1440);
    for (const bad of ["24:30", "25:00", "7:00", "07:60", "", null, 600]) assert.equal(parseTime(bad), null, String(bad));
    assert.equal(formatTime(0), "00:00");
    assert.equal(formatTime(1110), "18:30");
    assert.equal(formatTime(1440), "24:00");
  });

  test("fromEditorWindows: poniedziałek 0 → ISO 1, niedziela 6 → 7; minuty; niepoprawne → null przy tym oknie", () => {
    assert.deepEqual(
      fromEditorWindows([
        { weekday: 0, start: "18:00", end: "20:00" },
        { weekday: 6, start: "23:30", end: "24:00" },
        { weekday: 7, start: "9:00", end: "10:00" },
        "x",
      ]),
      [
        { weekday: 1, startMinute: 1080, endMinute: 1200 },
        { weekday: 7, startMinute: 1410, endMinute: 1440 },
        { weekday: null, startMinute: null, endMinute: 600 },
        null,
      ],
    );
    assert.equal(fromEditorWindows("x"), "x");
  });

  test("toEditorWindows: odwrotność fromEditorWindows (round-trip)", () => {
    const editor = [
      { weekday: 0, start: "00:00", end: "00:30" },
      { weekday: 1, start: "18:00", end: "20:00" },
      { weekday: 6, start: "23:30", end: "24:00" },
    ];
    const domain = /** @type {any} */ (fromEditorWindows(editor));
    assert.deepEqual(toEditorWindows(domain), editor);
  });

  test("fromEditorInput + walidacja: błąd przy indeksie wiersza edytora; mentorId pomijane", () => {
    const input = fromEditorInput({
      timeZone: "Europe/Warsaw",
      windows: [{ weekday: 1, start: "18:00", end: "20:00" }, { weekday: 3, start: "12:00", end: "11:00" }],
      mentorId: "b",
    });
    assert.deepEqual(Object.keys(input), ["timeZone", "windows"]);
    assert.deepEqual(validateAvailabilityInput(input), { ok: false, errors: { "windows.1": MESSAGES.endAfterStart } });
  });
});

describe("previewSlots", () => {
  const slot = (hour, lengthMinutes) => ({ startsAt: `2026-10-22T${String(hour).padStart(2, "0")}:00:00.000Z`, lengthMinutes });

  test("pierwsze N godzin startu z obiema długościami, kolejność wejścia", () => {
    const slots = [slot(1, 25), slot(1, 50), slot(2, 25), slot(3, 25), slot(3, 50)];
    assert.deepEqual(previewSlots(slots, 2), [slot(1, 25), slot(1, 50), slot(2, 25)]);
    assert.deepEqual(previewSlots(slots), slots);
    assert.deepEqual(previewSlots([]), []);
  });
});

describe("saveAvailabilityForSession bez sesji", () => {
  test("brak mentora → unauthorized, baza nie jest pytana", async () => {
    const db = /** @type {any} */ ({
      query: () => assert.fail("baza nie powinna być pytana"),
      connect: () => assert.fail("baza nie powinna być pytana"),
    });
    for (const mentor of [null, undefined, { mentorId: "" }, /** @type {any} */ ({})]) {
      assert.deepEqual(await saveAvailabilityForSession({ db, mentor, input: { timeZone: "UTC", windows: [] } }), {
        ok: false,
        reason: "unauthorized",
      });
    }
  });
});
