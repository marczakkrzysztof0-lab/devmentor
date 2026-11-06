// Obsługa HTTP tras czatu (spec #20 API Contracts, krok 2): Origin, typ treści, limit 16 KB (także bez
// Content-Length), kursor `after`, statusy wyników.
import { test } from "node:test";
import assert from "node:assert/strict";
import { isAllowedOrigin, MAX_BODY_BYTES, postStatus, readPostBody } from "../../lib/sessions/http.mjs";
import { parseAfter, validateMessageBody } from "../../lib/sessions/messages.mjs";

const APP = "https://devmentor.example";
const post = (body, headers = {}) => new Request(`${APP}/api/r/session`, { method: "POST", body, headers: { "content-type": "application/json", ...headers } });

test("Origin: brak albo origin aplikacji → dozwolony; obcy, zły adres → nie", () => {
  assert.equal(isAllowedOrigin(null, APP), true);
  assert.equal(isAllowedOrigin("", APP), true);
  assert.equal(isAllowedOrigin("https://devmentor.example", `${APP}/`), true);
  assert.equal(isAllowedOrigin("https://evil.example", APP), false);
  assert.equal(isAllowedOrigin("http://devmentor.example", APP), false);
  assert.equal(isAllowedOrigin("null", APP), false);
});

test("readPostBody: obcy Origin → 403, nie-JSON → 415, poprawny → treść pola body", async () => {
  assert.deepEqual(await readPostBody(post('{"body":"x"}', { origin: "https://evil.example" }), APP), { ok: false, status: 403, error: "forbidden_origin" });
  assert.deepEqual(await readPostBody(post("body=x", { "content-type": "application/x-www-form-urlencoded" }), APP), { ok: false, status: 415, error: "unsupported_media_type" });
  assert.deepEqual(await readPostBody(post('{"body":"Cześć"}', { origin: APP }), APP), { ok: true, body: "Cześć" });
  assert.deepEqual(await readPostBody(post("nie json"), APP), { ok: true, body: undefined });
});

test("readPostBody: powyżej 16 KB → 413, także strumieniem bez Content-Length", async () => {
  const big = JSON.stringify({ body: "x".repeat(MAX_BODY_BYTES) });
  assert.equal((await readPostBody(post(big), APP)).status, 413);
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(big));
      controller.close();
    },
  });
  const request = new Request(`${APP}/api/r/session`, { method: "POST", body: stream, duplex: "half", headers: { "content-type": "application/json" } });
  assert.equal((await readPostBody(request, APP)).status, 413);
});

test("statusy: 201, 400, 404, 409", () => {
  assert.equal(postStatus({ ok: true }), 201);
  assert.equal(postStatus({ ok: false, code: "invalid_body" }), 400);
  assert.equal(postStatus({ ok: false, code: "not_found" }), 404);
  for (const code of ["not_open", "closed", "limit_reached"]) assert.equal(postStatus({ ok: false, code }), 409);
});

test("parseAfter i validateMessageBody", () => {
  assert.equal(parseAfter("42"), 42);
  for (const value of [null, "", "-1", "1.5", "abc", "1".repeat(16)]) assert.equal(parseAfter(value), 0);
  assert.equal(validateMessageBody("ok").ok, true);
  assert.equal(validateMessageBody("🙂".repeat(4000)).ok, true, "emoji to jeden znak (punkty kodowe)");
  assert.equal(validateMessageBody("🙂".repeat(4001)).ok, false);
});
