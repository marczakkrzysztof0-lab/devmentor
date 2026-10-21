// Rdzeń sesji i linków z bazą (spec #14, Implementation Plan faza 1 krok 3 i testy z 2026-10-20:
// Z4, Z5, Z6, Z39): akceptacja zaproszenia, link logowania, sesje. Czas zawsze podawany jawnie (`NOW`).
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import {
  acceptInvitation,
  endSession,
  getMentorForSession,
  inspectInvitation,
  inspectSignInLink,
  PLACEHOLDER_SLUG_ATTEMPTS,
  redeemSignInLink,
  startSession,
} from "../../lib/auth/mentor-auth.mjs";
import { createInvitation, createSignInLink } from "../../scripts/mentor-links.mjs";
import { describeDb } from "./harness.mjs";

const APP_URL = "http://localhost:3000";
const NOW = new Date("2026-10-21T10:00:00.000Z");
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const INACTIVE = { ok: false, reason: "inactive" };
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const tokenFromUrl = (url) => url.slice(url.lastIndexOf("/") + 1);
const unknownToken = () => randomBytes(32).toString("base64url");

let emailCounter = 0;
const uniqueEmail = (label = "mentor") => `${label}-${(emailCounter += 1)}@example.com`;

describeDb("mentor-auth: zaproszenia, linki logowania i sesje", (db) => {
  /** Zaproszenie przez CLI założycieli; domyślnie utworzone godzinę przed NOW. */
  const invite = async (email = uniqueEmail(), createdAt = new Date(NOW.getTime() - HOUR_MS)) => {
    const { url } = await createInvitation({ db: db.pool, email, appUrl: APP_URL, now: createdAt });
    return { email, token: tokenFromUrl(url) };
  };

  /** Link logowania przez CLI; domyślnie utworzony godzinę przed NOW. */
  const signInLink = async (email, createdAt = new Date(NOW.getTime() - HOUR_MS)) => {
    const { url } = await createSignInLink({ db: db.pool, email, appUrl: APP_URL, now: createdAt });
    return tokenFromUrl(url);
  };

  /** Nowy mentor (zaproszenie + akceptacja) z aktywną sesją. */
  const newMentor = async (label) => {
    const { email, token } = await invite(uniqueEmail(label));
    const result = await acceptInvitation({ db: db.pool, token, now: NOW });
    assert.equal(result.ok, true);
    return { email, mentorId: result.mentorId, sessionToken: result.sessionToken };
  };

  /** Pełny stan tabel uwierzytelniania — do sprawdzenia, że coś „niczego nie zmienia”. */
  const snapshot = async () => {
    const tables = ["mentors", "invitations", "mentor_pages", "mentor_sessions", "mentor_sign_in_links"];
    const state = {};
    for (const table of tables) {
      state[table] = (await db.query(`select * from ${table} order by id`)).rows;
    }
    return state;
  };

  const sessionRow = async (token) =>
    (await db.query("select * from mentor_sessions where token_hash = $1", [sha256(token)])).rows[0];
  const linkRow = async (token) =>
    (await db.query("select * from mentor_sign_in_links where token_hash = $1", [sha256(token)])).rows[0];
  const invitationRow = async (token) =>
    (await db.query("select * from invitations where token_hash = $1", [sha256(token)])).rows[0];
  const sessionCount = async (mentorId) =>
    Number((await db.query("select count(*) from mentor_sessions where mentor_id = $1", [mentorId])).rows[0].count);

  // ---------------------------------------------------------------- akceptacja zaproszenia

  test("akceptacja: mentor z e-mailem z zaproszenia, szkic z mentor-xxxxxx, sesja 30 dni", async () => {
    // E-mail wstawiony bezpośrednio z wielkimi literami — mentor ma dokładnie tę wartość (kopiowana z zaproszenia).
    const token = unknownToken();
    await db.query("insert into invitations (email, token_hash, expires_at) values ($1, $2, $3)", [
      "Ola.Nowak@Example.com",
      sha256(token),
      new Date(NOW.getTime() + DAY_MS),
    ]);

    const result = await acceptInvitation({ db: db.pool, token, now: NOW });
    assert.equal(result.ok, true);
    assert.equal(result.alreadySignedIn, undefined);
    assert.match(result.sessionToken, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(result.sessionExpiresAt.getTime(), NOW.getTime() + 30 * DAY_MS);

    const mentor = (await db.query("select * from mentors where id = $1", [result.mentorId])).rows[0];
    assert.equal(mentor.email, "Ola.Nowak@Example.com");

    const invitation = await invitationRow(token);
    assert.equal(invitation.accepted_at.getTime(), NOW.getTime());
    assert.equal(invitation.mentor_id, result.mentorId);

    const pages = (await db.query("select * from mentor_pages where mentor_id = $1", [result.mentorId])).rows;
    assert.equal(pages.length, 1);
    assert.match(pages[0].slug, /^mentor-[a-z2-7]{6}$/);
    assert.equal(pages[0].published_at, null);
    assert.equal(pages[0].display_name, null);

    const session = await sessionRow(result.sessionToken);
    assert.equal(session.mentor_id, result.mentorId);
    assert.equal(session.revoked_at, null);
    assert.equal(session.expires_at.getTime(), NOW.getTime() + 30 * DAY_MS);
    assert.equal(session.created_at.getTime(), NOW.getTime());
    assert.equal(await sessionCount(result.mentorId), 1);
  });

  test("akceptacja to jedna transakcja: awaria w połowie (slug) nie zostawia niczego", async () => {
    const other = await newMentor("inny");
    const { token } = await invite();
    const before = await snapshot();

    await assert.rejects(
      acceptInvitation({
        db: db.pool,
        token,
        currentSessionToken: other.sessionToken,
        now: NOW,
        generateSlug: () => {
          throw new Error("awaria testowa");
        },
      }),
      /awaria testowa/,
    );
    // Ani mentora, ani przyjęcia zaproszenia, ani strony, ani sesji; sesja innego mentora nieodwołana.
    assert.deepEqual(await snapshot(), before);

    // Zaproszenie nadal działa.
    const result = await acceptInvitation({ db: db.pool, token, now: NOW });
    assert.equal(result.ok, true);
  });

  test("akceptacja: kolizja sluga → ponowne losowanie; same kolizje → wycofanie całości", async () => {
    const taken = (await db.query("select slug from mentor_pages limit 1")).rows[0].slug;

    const { token } = await invite();
    const slugs = [taken, "mentor-zzzz22"];
    const result = await acceptInvitation({ db: db.pool, token, now: NOW, generateSlug: () => slugs.shift() });
    assert.equal(result.ok, true);
    const page = (await db.query("select slug from mentor_pages where mentor_id = $1", [result.mentorId])).rows[0];
    assert.equal(page.slug, "mentor-zzzz22");

    const second = await invite();
    const before = await snapshot();
    let calls = 0;
    await assert.rejects(
      acceptInvitation({
        db: db.pool,
        token: second.token,
        now: NOW,
        generateSlug: () => {
          calls += 1;
          return taken;
        },
      }),
      /wolnego sluga/,
    );
    assert.equal(calls, PLACEHOLDER_SLUG_ATTEMPTS);
    assert.deepEqual(await snapshot(), before);
  });

  test("drugi raz to samo zaproszenie (bez sesji) → ta sama neutralna odpowiedź co wygasłe", async () => {
    const { token } = await invite();
    assert.equal((await acceptInvitation({ db: db.pool, token, now: NOW })).ok, true);

    const expired = await invite(uniqueEmail(), new Date(NOW.getTime() - 15 * DAY_MS));
    const expiredResult = await acceptInvitation({ db: db.pool, token: expired.token, now: NOW });
    assert.deepEqual(expiredResult, INACTIVE);

    const before = await snapshot();
    assert.deepEqual(await acceptInvitation({ db: db.pool, token, now: NOW }), expiredResult);
    assert.deepEqual(await inspectInvitation({ db: db.pool, token, now: NOW }), { status: "inactive" });
    assert.deepEqual(await snapshot(), before);
  });

  test("zaproszenie na e-mail, który ma już mentora → ta sama odpowiedź co wygasłe, nic nie powstaje", async () => {
    const email = uniqueEmail("dwa-zaproszenia");
    // Dwa otwarte zaproszenia na ten sam adres (CLI pozwala, dopóki nie ma mentora; #23 „Invitation contract”).
    const first = await invite(email);
    const second = await invite(email);
    assert.equal((await acceptInvitation({ db: db.pool, token: first.token, now: NOW })).ok, true);

    const expired = await invite(uniqueEmail(), new Date(NOW.getTime() - 15 * DAY_MS));
    const before = await snapshot();
    const result = await acceptInvitation({ db: db.pool, token: second.token, now: NOW });
    assert.deepEqual(result, await acceptInvitation({ db: db.pool, token: expired.token, now: NOW }));
    assert.deepEqual(result, INACTIVE);
    assert.deepEqual(await inspectInvitation({ db: db.pool, token: second.token, now: NOW }), {
      status: "inactive",
    });
    assert.deepEqual(await snapshot(), before);
  });

  test("wygasłe, odwołane, nieznane i puste tokeny zaproszenia → identyczna odpowiedź", async () => {
    // Wygasa dokładnie w chwili NOW (14 dni po utworzeniu) — już nieaktywne.
    const expired = await invite(uniqueEmail(), new Date(NOW.getTime() - 14 * DAY_MS));
    const revoked = await invite();
    await db.query("update invitations set revoked_at = $2 where token_hash = $1", [sha256(revoked.token), NOW]);

    const before = await snapshot();
    for (const token of [expired.token, revoked.token, unknownToken(), "", "x".repeat(1000)]) {
      assert.deepEqual(await acceptInvitation({ db: db.pool, token, now: NOW }), INACTIVE, token);
      assert.deepEqual(await inspectInvitation({ db: db.pool, token, now: NOW }), { status: "inactive" }, token);
    }
    assert.deepEqual(await snapshot(), before);

    // Ta sama chwila minus 1 ms: zaproszenie jeszcze ważne.
    assert.deepEqual(
      await inspectInvitation({ db: db.pool, token: expired.token, now: new Date(NOW.getTime() - 1) }),
      { status: "valid", expiresAt: NOW },
    );
  });

  test("przyjęte zaproszenie + sesja jego mentora → signed-in-as-owner / alreadySignedIn bez nowej sesji", async () => {
    const { token } = await invite();
    const accepted = await acceptInvitation({ db: db.pool, token, now: NOW });
    const other = await newMentor("obcy");

    const before = await snapshot();
    assert.deepEqual(
      await inspectInvitation({ db: db.pool, token, currentSessionToken: accepted.sessionToken, now: NOW }),
      { status: "signed-in-as-owner" },
    );
    assert.deepEqual(
      await acceptInvitation({ db: db.pool, token, currentSessionToken: accepted.sessionToken, now: NOW }),
      { ok: true, alreadySignedIn: true, mentorId: accepted.mentorId },
    );
    // Sesja innego mentora nie daje niczego.
    assert.deepEqual(
      await acceptInvitation({ db: db.pool, token, currentSessionToken: other.sessionToken, now: NOW }),
      INACTIVE,
    );
    assert.deepEqual(await snapshot(), before);
  });

  test("sesja innego mentora + ważne zaproszenie → stara sesja odwołana, nowa dla nowego mentora (L5/Z6)", async () => {
    const other = await newMentor("poprzedni");
    const { token } = await invite();

    assert.deepEqual(
      (await inspectInvitation({ db: db.pool, token, currentSessionToken: other.sessionToken, now: NOW })).status,
      "valid",
    );
    const result = await acceptInvitation({ db: db.pool, token, currentSessionToken: other.sessionToken, now: NOW });
    assert.equal(result.ok, true);
    assert.notEqual(result.mentorId, other.mentorId);

    assert.equal((await sessionRow(other.sessionToken)).revoked_at.getTime(), NOW.getTime());
    const fresh = await sessionRow(result.sessionToken);
    assert.equal(fresh.mentor_id, result.mentorId);
    assert.equal(fresh.revoked_at, null);
  });

  test("równoległe akceptacje: to samo zaproszenie i dwa zaproszenia na jeden e-mail → jeden mentor", async () => {
    const { email, token } = await invite();
    const same = await Promise.all([1, 2, 3].map(() => acceptInvitation({ db: db.pool, token, now: NOW })));
    assert.equal(same.filter((result) => result.ok).length, 1);
    assert.deepEqual(same.filter((result) => !result.ok), [INACTIVE, INACTIVE]);
    const mentors = await db.query("select id from mentors where lower(email) = lower($1)", [email]);
    assert.equal(mentors.rows.length, 1);

    const sharedEmail = uniqueEmail("wyscig");
    const first = await invite(sharedEmail);
    const second = await invite(sharedEmail);
    const both = await Promise.all(
      [first, second].map(({ token: t }) => acceptInvitation({ db: db.pool, token: t, now: NOW })),
    );
    assert.equal(both.filter((result) => result.ok).length, 1);
    assert.deepEqual(both.filter((result) => !result.ok), [INACTIVE]);
    const winners = await db.query("select id from mentors where lower(email) = lower($1)", [sharedEmail]);
    assert.equal(winners.rows.length, 1);
    const accepted = await db.query(
      "select count(*) from invitations where lower(email) = lower($1) and accepted_at is not null",
      [sharedEmail],
    );
    assert.equal(Number(accepted.rows[0].count), 1);
  });

  // ---------------------------------------------------------------- GET niczego nie zmienia

  test("inspectInvitation i inspectSignInLink niczego nie zmieniają (GET na poziomie domeny)", async () => {
    const mentor = await newMentor("inspekcja");
    const linkToken = await signInLink(mentor.email);
    const invitation = await invite();
    const other = await newMentor("inspekcja-obcy");

    const before = await snapshot();
    assert.deepEqual(await inspectInvitation({ db: db.pool, token: invitation.token, now: NOW }), {
      status: "valid",
      expiresAt: new Date(NOW.getTime() - HOUR_MS + 14 * DAY_MS),
    });
    assert.deepEqual(await inspectSignInLink({ db: db.pool, token: linkToken, now: NOW }), {
      status: "valid",
      expiresAt: new Date(NOW.getTime() - HOUR_MS + 72 * HOUR_MS),
    });
    assert.deepEqual(
      await inspectSignInLink({ db: db.pool, token: linkToken, currentSessionToken: other.sessionToken, now: NOW }),
      { status: "valid", expiresAt: new Date(NOW.getTime() - HOUR_MS + 72 * HOUR_MS) },
    );
    assert.deepEqual(
      await inspectSignInLink({ db: db.pool, token: linkToken, currentSessionToken: mentor.sessionToken, now: NOW }),
      { status: "signed-in-as-owner" },
    );
    assert.deepEqual(await inspectSignInLink({ db: db.pool, token: unknownToken(), now: NOW }), {
      status: "inactive",
    });
    assert.deepEqual(await snapshot(), before);
    assert.equal((await linkRow(linkToken)).used_at, null);
    assert.equal((await invitationRow(invitation.token)).accepted_at, null);
  });

  // ---------------------------------------------------------------- linki logowania

  test("ważny link logowania → sesja, used_at = now; ponowne użycie → nieaktywny", async () => {
    const mentor = await newMentor("logowanie");
    const token = await signInLink(mentor.email);

    const result = await redeemSignInLink({ db: db.pool, token, now: NOW });
    assert.equal(result.ok, true);
    assert.equal(result.mentorId, mentor.mentorId);
    assert.equal(result.sessionExpiresAt.getTime(), NOW.getTime() + 30 * DAY_MS);
    assert.equal((await linkRow(token)).used_at.getTime(), NOW.getTime());
    const session = await sessionRow(result.sessionToken);
    assert.equal(session.mentor_id, mentor.mentorId);
    assert.equal(session.expires_at.getTime(), NOW.getTime() + 30 * DAY_MS);

    const before = await snapshot();
    assert.deepEqual(await redeemSignInLink({ db: db.pool, token, now: NOW }), INACTIVE);
    assert.deepEqual(await inspectSignInLink({ db: db.pool, token, now: NOW }), { status: "inactive" });
    assert.deepEqual(await snapshot(), before);
  });

  test("wygasły, nieznany i pusty link logowania → ta sama odpowiedź, used_at zostaje null", async () => {
    const mentor = await newMentor("wygasly-link");
    // Utworzony 72 h przed NOW — wygasa dokładnie w NOW.
    const expired = await signInLink(mentor.email, new Date(NOW.getTime() - 72 * HOUR_MS));

    const before = await snapshot();
    for (const token of [expired, unknownToken(), ""]) {
      assert.deepEqual(await redeemSignInLink({ db: db.pool, token, now: NOW }), INACTIVE, token);
      assert.deepEqual(await inspectSignInLink({ db: db.pool, token, now: NOW }), { status: "inactive" }, token);
    }
    assert.deepEqual(await snapshot(), before);
    assert.equal((await linkRow(expired)).used_at, null);
  });

  test("ten sam mentor zalogowany + własny link → alreadySignedIn, link niezużyty (Z6)", async () => {
    const mentor = await newMentor("wlasny-link");
    const token = await signInLink(mentor.email);

    const before = await snapshot();
    assert.deepEqual(
      await redeemSignInLink({ db: db.pool, token, currentSessionToken: mentor.sessionToken, now: NOW }),
      { ok: true, alreadySignedIn: true, mentorId: mentor.mentorId },
    );
    assert.deepEqual(await snapshot(), before);
    assert.equal((await linkRow(token)).used_at, null);
  });

  test("dwa równoległe użycia linku → dokładnie jedna sesja; druga karta z sesją pierwszej → alreadySignedIn (Z39)", async () => {
    const mentor = await newMentor("dwie-karty");
    const token = await signInLink(mentor.email);
    const sessionsBefore = await sessionCount(mentor.mentorId);

    const results = await Promise.all(
      Array.from({ length: 4 }, () => redeemSignInLink({ db: db.pool, token, now: NOW })),
    );
    const winners = results.filter((result) => result.ok);
    assert.equal(winners.length, 1);
    assert.equal(results.filter((result) => !result.ok).length, 3);
    for (const loser of results.filter((result) => !result.ok)) assert.deepEqual(loser, INACTIVE);
    assert.equal(await sessionCount(mentor.mentorId), sessionsBefore + 1);

    // Druga karta wysyła już ciasteczko z sesji pierwszej.
    assert.deepEqual(
      await redeemSignInLink({ db: db.pool, token, currentSessionToken: winners[0].sessionToken, now: NOW }),
      { ok: true, alreadySignedIn: true, mentorId: mentor.mentorId },
    );
    assert.equal(await sessionCount(mentor.mentorId), sessionsBefore + 1);
  });

  test("sesja innego mentora + ważny link logowania → stara sesja odwołana, nowa utworzona", async () => {
    const owner = await newMentor("wlasciciel-linku");
    const other = await newMentor("inny-zalogowany");
    const token = await signInLink(owner.email);

    const result = await redeemSignInLink({ db: db.pool, token, currentSessionToken: other.sessionToken, now: NOW });
    assert.equal(result.ok, true);
    assert.equal(result.mentorId, owner.mentorId);
    assert.equal((await sessionRow(other.sessionToken)).revoked_at.getTime(), NOW.getTime());
    assert.equal((await sessionRow(result.sessionToken)).mentor_id, owner.mentorId);
    assert.equal((await linkRow(token)).used_at.getTime(), NOW.getTime());
  });

  // ---------------------------------------------------------------- sesje

  test("startSession: wygasa dokładnie po 30 dniach, w bazie tylko hash", async () => {
    const mentor = await newMentor("start");
    const { token, expiresAt } = await startSession({ db: db.pool, mentorId: mentor.mentorId, now: NOW });
    assert.equal(expiresAt.getTime(), NOW.getTime() + 30 * DAY_MS);
    const row = await sessionRow(token);
    assert.equal(row.expires_at.getTime(), NOW.getTime() + 30 * DAY_MS);
    assert.equal(row.token_hash, sha256(token));
    assert.ok(Object.values(row).every((value) => String(value) !== token));
  });

  test("getMentorForSession: tylko id; null dla wygasłej, odwołanej, nieznanej i pustej", async () => {
    const mentor = await newMentor("sesje");
    const { token, expiresAt } = await startSession({ db: db.pool, mentorId: mentor.mentorId, now: NOW });

    const found = await getMentorForSession({ db: db.pool, token, now: NOW });
    assert.deepEqual(Object.keys(found).sort(), ["mentorId", "sessionId"]);
    assert.equal(found.mentorId, mentor.mentorId);
    assert.equal(found.sessionId, (await sessionRow(token)).id);

    assert.ok(await getMentorForSession({ db: db.pool, token, now: new Date(expiresAt.getTime() - 1) }));
    assert.equal(await getMentorForSession({ db: db.pool, token, now: expiresAt }), null);
    assert.equal(await getMentorForSession({ db: db.pool, token, now: new Date(expiresAt.getTime() + DAY_MS) }), null);
    assert.equal(await getMentorForSession({ db: db.pool, token: unknownToken(), now: NOW }), null);
    assert.equal(await getMentorForSession({ db: db.pool, token: undefined, now: NOW }), null);
    assert.equal(await getMentorForSession({ db: db.pool, token: "", now: NOW }), null);

    await endSession({ db: db.pool, token, now: NOW });
    assert.equal(await getMentorForSession({ db: db.pool, token, now: NOW }), null);
  });

  test("endSession ustawia revoked_at i jest idempotentne", async () => {
    const mentor = await newMentor("wyloguj");
    const { token } = await startSession({ db: db.pool, mentorId: mentor.mentorId, now: NOW });

    await endSession({ db: db.pool, token, now: NOW });
    assert.equal((await sessionRow(token)).revoked_at.getTime(), NOW.getTime());
    await endSession({ db: db.pool, token, now: new Date(NOW.getTime() + HOUR_MS) });
    assert.equal((await sessionRow(token)).revoked_at.getTime(), NOW.getTime());

    // Nieznany i pusty token: brak operacji, bez błędu.
    await endSession({ db: db.pool, token: unknownToken(), now: NOW });
    await endSession({ db: db.pool, token: undefined, now: NOW });
  });

  test("wylogowany mentor nie jest „właścicielem” linku: własny link zostaje użyty i tworzy sesję", async () => {
    const mentor = await newMentor("po-wylogowaniu");
    await endSession({ db: db.pool, token: mentor.sessionToken, now: NOW });
    const token = await signInLink(mentor.email);

    assert.equal(
      (await inspectSignInLink({ db: db.pool, token, currentSessionToken: mentor.sessionToken, now: NOW })).status,
      "valid",
    );
    const result = await redeemSignInLink({ db: db.pool, token, currentSessionToken: mentor.sessionToken, now: NOW });
    assert.equal(result.ok, true);
    assert.equal(result.alreadySignedIn, undefined);
    assert.equal((await linkRow(token)).used_at.getTime(), NOW.getTime());
  });
});
