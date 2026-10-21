// Ograniczenia bazy kodujące reguły biznesowe (spec #23, Data Model; migracja 0001).
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { describeDb } from "./harness.mjs";

const unique = () => randomBytes(6).toString("hex");

// Oczekuje błędu PostgreSQL o danym kodzie (i opcjonalnie nazwie ograniczenia).
async function assertPgError(promise, code, constraint) {
  await assert.rejects(promise, (error) => {
    assert.equal(error.code, code, error.message);
    if (constraint) assert.equal(error.constraint, constraint, error.message);
    return true;
  });
}

const complete = {
  display_name: "Ala Kowalska",
  public_work_url: "https://github.com/ala",
  description: "Pomagam w code review i architekturze frontendu.",
};

describeDb("schemat 0001: mentors, invitations, mentor_pages", (db) => {
  async function createMentor(email = `mentor-${unique()}@example.com`) {
    const { rows } = await db.query("insert into mentors (email) values ($1) returning id", [email]);
    return rows[0].id;
  }

  async function createPage(mentorId, fields = {}) {
    const page = {
      slug: `m-${unique()}`,
      display_name: null,
      public_work_url: null,
      description: null,
      published_at: null,
      ...fields,
    };
    const { rows } = await db.query(
      `insert into mentor_pages (mentor_id, slug, display_name, public_work_url, description, published_at)
       values ($1, $2, $3, $4, $5, $6) returning id`,
      [mentorId, page.slug, page.display_name, page.public_work_url, page.description, page.published_at],
    );
    return rows[0].id;
  }

  async function createInvitation(fields = {}) {
    const invitation = {
      email: `invite-${unique()}@example.com`,
      token_hash: unique() + unique(),
      expires_at: new Date(Date.now() + 14 * 24 * 3600 * 1000),
      accepted_at: null,
      revoked_at: null,
      mentor_id: null,
      ...fields,
    };
    const { rows } = await db.query(
      `insert into invitations (email, token_hash, expires_at, accepted_at, revoked_at, mentor_id)
       values ($1, $2, $3, $4, $5, $6) returning id`,
      [
        invitation.email,
        invitation.token_hash,
        invitation.expires_at,
        invitation.accepted_at,
        invitation.revoked_at,
        invitation.mentor_id,
      ],
    );
    return rows[0].id;
  }

  test("domyślne wartości: uuid, created_at/updated_at", async () => {
    const id = await createMentor();
    const { rows } = await db.query("select * from mentors where id = $1", [id]);
    assert.match(rows[0].id, /^[0-9a-f-]{36}$/);
    assert.ok(rows[0].created_at instanceof Date);
    assert.ok(rows[0].updated_at instanceof Date);
  });

  test("szkic strony może nie mieć treści", async () => {
    const pageId = await createPage(await createMentor());
    const { rows } = await db.query("select published_at, display_name from mentor_pages where id = $1", [pageId]);
    assert.equal(rows[0].published_at, null);
    assert.equal(rows[0].display_name, null);
  });

  test("publikacja z kompletem treści przechodzi", async () => {
    await createPage(await createMentor(), { ...complete, published_at: new Date() });
  });

  test("R03: publikacja bez public_work_url, description lub display_name jest odrzucana", async () => {
    for (const missing of ["public_work_url", "description", "display_name"]) {
      await assertPgError(
        createPage(await createMentor(), { ...complete, [missing]: null, published_at: new Date() }),
        "23514",
        "published_requires_content",
      );
    }
  });

  test("R03: same białe znaki w polach publikacji są odrzucane", async () => {
    for (const blank of ["", "   ", "\t\n ", " \r\n"]) {
      for (const field of ["public_work_url", "description", "display_name"]) {
        await assertPgError(
          createPage(await createMentor(), { ...complete, [field]: blank, published_at: new Date() }),
          "23514",
          "published_requires_content",
        );
      }
    }
  });

  test("R03: opublikowanej strony nie da się wyczyścić z treści", async () => {
    const pageId = await createPage(await createMentor(), { ...complete, published_at: new Date() });
    await assertPgError(
      db.query("update mentor_pages set description = '  ' where id = $1", [pageId]),
      "23514",
      "published_requires_content",
    );
  });

  test("zduplikowany slug jest odrzucany", async () => {
    const slug = `dup-${unique()}`;
    await createPage(await createMentor(), { slug });
    await assertPgError(createPage(await createMentor(), { slug }), "23505", "mentor_pages_slug_key");
  });

  test("mentor ma najwyżej jedną stronę", async () => {
    const mentorId = await createMentor();
    await createPage(mentorId);
    await assertPgError(createPage(mentorId), "23505", "mentor_pages_mentor_id_key");
  });

  test("slug: niepoprawne formaty są odrzucane", async () => {
    const bad = [
      "Ala-kowalska", // wielkie litery
      "ab", // za krótki
      "a", // za krótki
      "-ala", // myślnik na początku
      "ala-", // myślnik na końcu
      "a".repeat(41), // 41 znaków
      "ala kowalska", // spacja
      "ala_kowalska", // podkreślenie
      "zażółć", // znaki spoza ASCII
      "ala\n", // nowa linia na końcu
    ];
    for (const slug of bad) {
      await assertPgError(createPage(await createMentor(), { slug }), "23514", "mentor_pages_slug_format");
    }
  });

  test("slug: poprawne (w tym 3 i 40 znaków) są przyjmowane", async () => {
    const suffix = unique().slice(0, 6);
    const good = [
      "a1b", // 3 znaki
      `x${suffix}`.padEnd(40, "z"), // 40 znaków
      `ala-kowalska-${suffix}`,
      `0${suffix}9`,
      `a--b-${suffix}`,
    ];
    assert.equal(good[0].length, 3);
    assert.equal(good[1].length, 40);
    for (const slug of good) await createPage(await createMentor(), { slug });
  });

  test("e-mail mentora unikalny bez względu na wielkość liter", async () => {
    const local = `Ola-${unique()}`;
    await createMentor(`${local}@Example.com`);
    await assertPgError(createMentor(`${local.toLowerCase()}@example.COM`), "23505", "mentors_email_lower_key");
  });

  test("zaproszenie: hash tokenu unikalny, expires_at wymagane", async () => {
    const tokenHash = unique() + unique();
    await createInvitation({ token_hash: tokenHash });
    await assertPgError(createInvitation({ token_hash: tokenHash }), "23505", "invitations_token_hash_key");
    await assertPgError(createInvitation({ expires_at: null }), "23502");
  });

  test("zaproszenie z accepted_at bez mentor_id jest odrzucane (i odwrotnie)", async () => {
    await assertPgError(createInvitation({ accepted_at: new Date() }), "23514", "invitations_accepted_has_mentor");
    await assertPgError(
      createInvitation({ mentor_id: await createMentor() }),
      "23514",
      "invitations_accepted_has_mentor",
    );
    await createInvitation({ accepted_at: new Date(), mentor_id: await createMentor() });
  });

  test("zaproszenie nie może być jednocześnie przyjęte i odwołane", async () => {
    await assertPgError(
      createInvitation({ accepted_at: new Date(), mentor_id: await createMentor(), revoked_at: new Date() }),
      "23514",
      "invitations_not_accepted_and_revoked",
    );
    await createInvitation({ revoked_at: new Date() });
  });

  test("mentor ma najwyżej jedno przyjęte zaproszenie", async () => {
    const mentorId = await createMentor();
    await createInvitation({ accepted_at: new Date(), mentor_id: mentorId });
    await assertPgError(
      createInvitation({ accepted_at: new Date(), mentor_id: mentorId }),
      "23505",
      "invitations_mentor_id_key",
    );
  });

  test("usunięcie mentora usuwa jego stronę i zaproszenie", async () => {
    const mentorId = await createMentor();
    const pageId = await createPage(mentorId, { ...complete, published_at: new Date() });
    const invitationId = await createInvitation({ accepted_at: new Date(), mentor_id: mentorId });
    const otherInvitation = await createInvitation();

    await db.query("delete from mentors where id = $1", [mentorId]);

    const pages = await db.query("select 1 from mentor_pages where id = $1", [pageId]);
    const invitations = await db.query("select id from invitations where id = any($1::uuid[])", [
      [invitationId, otherInvitation],
    ]);
    assert.equal(pages.rowCount, 0);
    assert.deepEqual(
      invitations.rows.map((row) => row.id),
      [otherInvitation],
    );
  });

  test("brak kolumn ocen, katalogu i wypłat", async () => {
    const { rows } = await db.query(
      "select table_name, column_name from information_schema.columns where table_schema = $1",
      [db.schema],
    );
    for (const { table_name: table, column_name: column } of rows) {
      assert.doesNotMatch(`${table}.${column}`, /rating|review|stars|directory|listed|featured|payout|iban|bank/i);
    }
  });
});
