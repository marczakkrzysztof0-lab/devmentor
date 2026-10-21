// Routing `/m/*` dla proxy.ts (spec #16 Q4, Q5, story 4–5; Z19, Z20, zadanie 5.2).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MENTOR_NOT_FOUND_REWRITE_PATH,
  MENTOR_ROBOTS,
  mentorSlugFromPath,
} from "../../lib/mentor-page/share-route.mjs";

test("mentorSlugFromPath: /m/{slug} z poprawnym slugiem → slug", () => {
  assert.equal(mentorSlugFromPath("/m/anna-k"), "anna-k");
  assert.equal(mentorSlugFromPath("/m/anna-k/"), "anna-k");
  assert.equal(mentorSlugFromPath(`/m/${"a".repeat(40)}`), "a".repeat(40));
});

test("mentorSlugFromPath: /m, głębsze ścieżki i inne trasy → null (brak katalogu, R14)", () => {
  for (const path of ["/m", "/m/", "/m/anna-k/x", "/m/_/nie-ma-takiej-strony", "/", "/mentor", "/mentor/availability", "/x/anna-k"]) {
    assert.equal(mentorSlugFromPath(path), null, path);
  }
});

test("mentorSlugFromPath: niepoprawny slug → null (ten sam 404 co nieznany, Q4)", () => {
  for (const path of ["/m/Anna-K", "/m/anna_k", "/m/anna%2Dk", "/m/ab", "/m/-abc", "/m/abc-", `/m/${"a".repeat(41)}`, "/m/%3Cscript%3E"]) {
    assert.equal(mentorSlugFromPath(path), null, path);
  }
});

test("cel przepisania nie jest adresem strony mentora (główne not-found, 404); robots noindex, nofollow", () => {
  assert.equal(mentorSlugFromPath(MENTOR_NOT_FOUND_REWRITE_PATH), null);
  assert.equal(MENTOR_ROBOTS, "noindex, nofollow");
});
