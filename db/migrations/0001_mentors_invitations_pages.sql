-- 0001: mentorzy, zaproszenia i strony mentorów (spec #23, Data Model).
-- Wszystkie czasy w timestamptz (UTC); `updated_at` ustawia aplikacja (bez triggerów).
-- Celowo bez kolumn ocen/recenzji (R03, N02), flag katalogu (R14, D03) i danych wypłat (R13, D07).

-- Up Migration

CREATE TABLE mentors (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  email text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mentors_pkey PRIMARY KEY (id)
);

-- Jeden mentor na adres e-mail bez względu na wielkość liter.
CREATE UNIQUE INDEX mentors_email_lower_key ON mentors (lower(email));

CREATE TABLE invitations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  email text NOT NULL,
  -- Tylko SHA-256 tokenu z linku; sam token nie jest przechowywany (Q6).
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  revoked_at timestamptz,
  mentor_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT invitations_pkey PRIMARY KEY (id),
  CONSTRAINT invitations_token_hash_key UNIQUE (token_hash),
  CONSTRAINT invitations_mentor_id_key UNIQUE (mentor_id),
  CONSTRAINT invitations_mentor_id_fkey FOREIGN KEY (mentor_id)
    REFERENCES mentors (id) ON DELETE CASCADE,
  -- Przyjęte ⇔ powiązane z mentorem.
  CONSTRAINT invitations_accepted_has_mentor CHECK ((accepted_at IS NULL) = (mentor_id IS NULL)),
  -- Nigdy jednocześnie przyjęte i odwołane.
  CONSTRAINT invitations_not_accepted_and_revoked CHECK (accepted_at IS NULL OR revoked_at IS NULL)
);

CREATE TABLE mentor_pages (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  mentor_id uuid NOT NULL,
  -- Segment ścieżki linku do udostępnienia: 3–40 znaków, małe litery, cyfry i myślniki
  -- (myślnik nie na początku ani na końcu).
  slug text NOT NULL,
  display_name text,
  public_work_url text,
  description text,
  -- NULL = szkic.
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mentor_pages_pkey PRIMARY KEY (id),
  CONSTRAINT mentor_pages_mentor_id_key UNIQUE (mentor_id),
  CONSTRAINT mentor_pages_mentor_id_fkey FOREIGN KEY (mentor_id)
    REFERENCES mentors (id) ON DELETE CASCADE,
  CONSTRAINT mentor_pages_slug_key UNIQUE (slug),
  CONSTRAINT mentor_pages_slug_format CHECK (slug ~ '^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$'),
  -- R03: opublikowana strona ma nazwę, link do publicznej pracy i opis (nie same białe znaki).
  -- Migracja 0003 (#14) zastępuje tę regułę wersją z cenami.
  CONSTRAINT published_requires_content CHECK (
    published_at IS NULL
    OR (
      length(btrim(coalesce(display_name, ''), E' \t\r\n\f')) > 0
      AND length(btrim(coalesce(public_work_url, ''), E' \t\r\n\f')) > 0
      AND length(btrim(coalesce(description, ''), E' \t\r\n\f')) > 0
    )
  )
);

-- Down Migration

DROP TABLE mentor_pages;
DROP TABLE invitations;
DROP TABLE mentors;
