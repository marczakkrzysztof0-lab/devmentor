// Reguła scripts/check-date-selectors.mjs (lekcja 17): niejednoznaczne selektory dat w e2e.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { findDateSelectors } from "../scripts/check-date-selectors.mjs";

const rules = (line) => findDateSelectors(line).map((v) => v.rule);

describe("check-date-selectors", () => {
  test("D1: data wklejona w RegExp (błąd z PR #49 i jego wersja po poprawce inline)", () => {
    assert.deepEqual(rules('await r.getByRole("radio", { name: new RegExp(`${date.replace(".", "\\\\.")}.*${time}`) })'), ["D1"]);
    assert.deepEqual(rules("const re = new RegExp(`(?<!\\\\d)${slotDate},\\\\s*${time}$`);"), ["D1"]);
    assert.deepEqual(rules("new RegExp(`${dayLabel}, 18:00`)"), ["D1"]);
  });

  test("D2: data na sztywno bez granicy przed nią", () => {
    assert.deepEqual(rules('page.getByRole("radio", { name: /1\\.11.*17:00/ })'), ["D2"]);
    assert.deepEqual(rules("new RegExp(`1\\\\.11, 17:00`)"), ["D2"]);
  });

  test("dozwolone: helper, granica przed datą, godziny, ceny, wyjątek z powodem, komentarze", () => {
    assert.deepEqual(rules("name: slotRadioNamePattern(parsed.date, parsed.time)"), []);
    assert.deepEqual(rules('page.getByRole("radio", { name: /(?<!\\d)1\\.11, 17:00$/ })'), []);
    assert.deepEqual(rules("const ok = /\\b1\\.11\\b/.test(x);"), []);
    assert.deepEqual(rules('return !/\\b12:(00|30)\\b/.test(list.textContent ?? "");'), []);
    assert.deepEqual(rules("new RegExp(`${mentor.price25} zł[\\\\s\\\\S]*${EMPTY}`)"), []);
    assert.deepEqual(rules("new RegExp(`${date}`) // date-selector-ok: jedna data w oknie"), []);
    assert.deepEqual(rules("// „1.11, 17:00” nie może trafić w „11.11, 17:00” (new RegExp(`${date}.*`))"), []);
  });
});
