// Routing prywatnej strony zapytania /r/{token} (spec #17; lib/requests/request-route.mjs).
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { requestTokenFromPath } from "../../lib/requests/request-route.mjs";

const TOKEN = randomBytes(32).toString("base64url");

test("token ma 43 znaki base64url", () => {
  assert.equal(TOKEN.length, 43);
});

test("/r/<token> zwraca token (także z ukośnikiem na końcu)", () => {
  assert.equal(requestTokenFromPath(`/r/${TOKEN}`), TOKEN);
  assert.equal(requestTokenFromPath(`/r/${TOKEN}/`), TOKEN);
});

test("samo /r, /r/ i pusta ścieżka → null", () => {
  for (const path of ["/r", "/r/", "/", ""]) assert.equal(requestTokenFromPath(path), null, path);
});

test("głębsza ścieżka, inny prefiks i brak prefiksu → null", () => {
  for (const path of [`/r/${TOKEN}/dalej`, "/r/a/b", "/m/x", `/m/${TOKEN}`, `/${TOKEN}`, `/rr/${TOKEN}`]) {
    assert.equal(requestTokenFromPath(path), null, path);
  }
});

test("zakodowane znaki (np. /r/%2e%2e) → null", () => {
  for (const path of ["/r/%2e%2e", `/r/${TOKEN.slice(0, 10)}%41`, "/r/a.b", "/r/a b"]) {
    assert.equal(requestTokenFromPath(path), null, path);
  }
});

test("token dłuższy niż 256 znaków → null, 256 jeszcze poprawny", () => {
  assert.equal(requestTokenFromPath(`/r/${"a".repeat(256)}`), "a".repeat(256));
  assert.equal(requestTokenFromPath(`/r/${"a".repeat(257)}`), null);
});
