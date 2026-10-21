// Rdzeń logowania mentora bez bazy (spec #14, Q6): slug szkicu i stałe kontraktu.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  generatePlaceholderSlug,
  INACTIVE_LINK_MESSAGE,
  PLACEHOLDER_SLUG_PREFIX,
  SESSION_COOKIE,
} from "../../lib/auth/mentor-auth.mjs";

// CHECK `mentor_pages_slug_format` z db/migrations/0001_mentors_invitations_pages.sql.
const SLUG_CHECK_0001 = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;

describe("generatePlaceholderSlug", () => {
  const samples = Array.from({ length: 2000 }, () => generatePlaceholderSlug());

  test("format: mentor- + 6 znaków base32 małymi literami (a–z, 2–7)", () => {
    for (const slug of samples) assert.match(slug, /^mentor-[a-z2-7]{6}$/);
    assert.ok(samples.every((slug) => slug.startsWith(PLACEHOLDER_SLUG_PREFIX)));
  });

  test("spełnia regułę sluga z migracji 0001", () => {
    for (const slug of samples) assert.match(slug, SLUG_CHECK_0001);
  });

  test("losowy: praktycznie bez powtórzeń i z użyciem całego alfabetu", () => {
    assert.ok(new Set(samples).size >= samples.length - 2);
    const used = new Set(samples.flatMap((slug) => [...slug.slice(PLACEHOLDER_SLUG_PREFIX.length)]));
    assert.equal(used.size, 32);
  });
});

describe("stałe kontraktu", () => {
  test("nazwa ciasteczka, neutralny komunikat i prefiks sluga", () => {
    assert.equal(SESSION_COOKIE, "dm_session");
    assert.equal(INACTIVE_LINK_MESSAGE, "Ten link jest nieaktywny — poproś zespół o nowy");
    assert.equal(PLACEHOLDER_SLUG_PREFIX, "mentor-");
  });
});
