// Tokeny linków i sesji (spec #14, API Contracts „Token links”) — bez bazy.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  generateToken,
  hashToken,
  INVITATION_TTL_DAYS,
  SESSION_TTL_DAYS,
  SIGN_IN_LINK_TTL_HOURS,
  TOKEN_BYTES,
} from "../../lib/auth/tokens.mjs";

describe("generateToken", () => {
  test("32 bajty w base64url: 43 znaki [A-Za-z0-9_-], bez dopełnienia", () => {
    const token = generateToken();
    assert.equal(token.length, 43);
    assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  });

  test("dekoduje się do 32 bajtów (≥ 128 bitów entropii)", () => {
    const bytes = Buffer.from(generateToken(), "base64url");
    assert.equal(bytes.length, TOKEN_BYTES);
    assert.ok(TOKEN_BYTES * 8 >= 128);
  });

  test("kolejne tokeny są różne", () => {
    const tokens = new Set(Array.from({ length: 200 }, () => generateToken()));
    assert.equal(tokens.size, 200);
  });
});

describe("hashToken", () => {
  test("SHA-256 hex: 64 znaki, deterministyczny", () => {
    const token = generateToken();
    const hash = hashToken(token);
    assert.match(hash, /^[0-9a-f]{64}$/);
    assert.equal(hashToken(token), hash);
    assert.equal(hash, createHash("sha256").update(token).digest("hex"));
  });

  test("hash różni się od tokenu i od hasha innego tokenu", () => {
    const token = generateToken();
    assert.notEqual(hashToken(token), token);
    assert.notEqual(hashToken(token), hashToken(generateToken()));
  });

  test("odrzuca pusty lub nie-napisowy token", () => {
    assert.throws(() => hashToken(""), TypeError);
    assert.throws(() => hashToken(/** @type {any} */ (undefined)), TypeError);
  });
});

test("stałe ważności zgodne ze specyfikacją", () => {
  assert.equal(INVITATION_TTL_DAYS, 14);
  assert.equal(SIGN_IN_LINK_TTL_HOURS, 72);
  assert.equal(SESSION_TTL_DAYS, 30);
});
