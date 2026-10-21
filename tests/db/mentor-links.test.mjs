// CLI założycieli z bazą (spec #14, Implementation Plan faza 1 krok 2): createInvitation, createSignInLink.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createInvitation, createSignInLink, MentorLinksError } from "../../scripts/mentor-links.mjs";
import { describeDb } from "./harness.mjs";

const APP_URL = "http://localhost:3000/";
const NOW = new Date("2026-10-21T10:00:00.000Z");
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

/** Wszystkie wartości wiersza jako napisy — do sprawdzenia, że tokenu nie ma w żadnej kolumnie. */
const rowValues = (row) =>
  Object.values(row).map((value) => (value instanceof Date ? value.toISOString() : String(value)));

describeDb("mentor-links: zaproszenia i linki logowania", (db) => {
  test("zaproszenie: link z tokenem, w bazie tylko hash, ważność dokładnie 14 dni", async () => {
    const { url, expiresAt } = await createInvitation({ db, email: "anna@example.com", appUrl: APP_URL, now: NOW });

    const match = url.match(/^http:\/\/localhost:3000\/invite\/([A-Za-z0-9_-]{43})$/);
    assert.ok(match, url);
    const token = match[1];
    assert.equal(expiresAt.getTime(), NOW.getTime() + 14 * DAY_MS);

    const { rows } = await db.query("select * from invitations where token_hash = $1", [sha256(token)]);
    assert.equal(rows.length, 1);
    const [row] = rows;
    assert.equal(row.email, "anna@example.com");
    assert.equal(row.expires_at.getTime(), NOW.getTime() + 14 * DAY_MS);
    assert.equal(row.created_at.getTime(), NOW.getTime());
    assert.equal(row.accepted_at, null);
    assert.equal(row.revoked_at, null);
    assert.equal(row.mentor_id, null);
    assert.ok(rowValues(row).every((value) => !value.includes(token)), "token nie może być zapisany");
  });

  test("zaproszenie: e-mail przycięty i zapisany małymi literami; kolejne zaproszenie dla tego adresu dozwolone", async () => {
    const first = await createInvitation({ db, email: "  Bartek@Example.COM ", appUrl: APP_URL, now: NOW });
    const second = await createInvitation({ db, email: "bartek@example.com", appUrl: APP_URL, now: NOW });
    assert.notEqual(first.url, second.url);
    const { rows } = await db.query("select email from invitations where lower(email) = 'bartek@example.com'");
    assert.deepEqual(
      rows.map((r) => r.email),
      ["bartek@example.com", "bartek@example.com"],
    );
  });

  test("zaproszenie: odmowa, gdy mentor z tym adresem istnieje (dowolna wielkość liter), z podpowiedzią sign-in-link", async () => {
    await db.query("insert into mentors (email) values ('Cezary@Example.com')");
    for (const email of ["cezary@example.com", "CEZARY@EXAMPLE.COM", " Cezary@Example.com "]) {
      await assert.rejects(
        createInvitation({ db, email, appUrl: APP_URL, now: NOW }),
        (error) =>
          error instanceof MentorLinksError &&
          /już istnieje/.test(error.message) &&
          error.message.includes("npm run mentor:sign-in-link -- cezary@example.com"),
      );
    }
    const { rows } = await db.query(
      "select count(*)::int as n from invitations where lower(email) = 'cezary@example.com'",
    );
    assert.equal(rows[0].n, 0);
  });

  test("zaproszenie: niepoprawny e-mail odrzucony, nic nie zapisane", async () => {
    const before = await db.query("select count(*)::int as n from invitations");
    for (const email of ["", "nie-email", "a@b", "x y@example.com"]) {
      await assert.rejects(createInvitation({ db, email, appUrl: APP_URL, now: NOW }), MentorLinksError);
    }
    const afterCount = await db.query("select count(*)::int as n from invitations");
    assert.equal(afterCount.rows[0].n, before.rows[0].n);
  });

  test("link logowania: odmowa dla nieznanego adresu, nic nie zapisane", async () => {
    await assert.rejects(
      createSignInLink({ db, email: "nobody@example.com", appUrl: APP_URL, now: NOW }),
      (error) =>
        error instanceof MentorLinksError && /Nie ma mentora z adresem nobody@example\.com/.test(error.message),
    );
    const { rows } = await db.query("select count(*)::int as n from mentor_sign_in_links");
    assert.equal(rows[0].n, 0);
  });

  test("link logowania: dla istniejącego mentora (inna wielkość liter), tylko hash, ważność 72 h", async () => {
    const { rows: mentors } = await db.query(
      "insert into mentors (email) values ('Dorota@Example.com') returning id",
    );
    const mentorId = mentors[0].id;

    const { url, expiresAt } = await createSignInLink({ db, email: "DOROTA@example.com", appUrl: APP_URL, now: NOW });
    const match = url.match(/^http:\/\/localhost:3000\/sign-in\/([A-Za-z0-9_-]{43})$/);
    assert.ok(match, url);
    const token = match[1];
    assert.equal(expiresAt.getTime(), NOW.getTime() + 72 * HOUR_MS);

    const { rows } = await db.query("select * from mentor_sign_in_links where token_hash = $1", [sha256(token)]);
    assert.equal(rows.length, 1);
    const [row] = rows;
    assert.equal(row.mentor_id, mentorId);
    assert.equal(row.expires_at.getTime(), expiresAt.getTime());
    assert.equal(row.created_at.getTime(), NOW.getTime());
    assert.equal(row.used_at, null);
    assert.ok(rowValues(row).every((value) => !value.includes(token)), "token nie może być zapisany");
  });

  test("link logowania: niepoprawny e-mail odrzucony", async () => {
    await assert.rejects(createSignInLink({ db, email: "dorota", appUrl: APP_URL, now: NOW }), MentorLinksError);
  });
});
