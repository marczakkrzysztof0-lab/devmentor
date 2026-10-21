-- 0002: sesje mentorów i linki logowania (spec #14, Data Model, faza 1).
-- Tylko hashe SHA-256 tokenów (z ciasteczka `dm_session` i z linku logowania); same tokeny nie są przechowywane.
-- Celowo bez danych wypłat i kont bankowych (R13).

-- Up Migration

CREATE TABLE mentor_sessions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  mentor_id uuid NOT NULL,
  token_hash text NOT NULL,
  -- created_at + 30 dni, bez przedłużania (ustawia aplikacja).
  expires_at timestamptz NOT NULL,
  -- Wylogowanie albo zastąpienie sesją innego mentora.
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mentor_sessions_pkey PRIMARY KEY (id),
  CONSTRAINT mentor_sessions_token_hash_key UNIQUE (token_hash),
  CONSTRAINT mentor_sessions_mentor_id_fkey FOREIGN KEY (mentor_id)
    REFERENCES mentors (id) ON DELETE CASCADE
);

CREATE INDEX mentor_sessions_mentor_id_idx ON mentor_sessions (mentor_id);

CREATE TABLE mentor_sign_in_links (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  mentor_id uuid NOT NULL,
  token_hash text NOT NULL,
  -- created_at + 72 godziny (ustawia CLI założycieli).
  expires_at timestamptz NOT NULL,
  -- Jednorazowość: ustawiane warunkowym UPDATE przy użyciu linku.
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mentor_sign_in_links_pkey PRIMARY KEY (id),
  CONSTRAINT mentor_sign_in_links_token_hash_key UNIQUE (token_hash),
  CONSTRAINT mentor_sign_in_links_mentor_id_fkey FOREIGN KEY (mentor_id)
    REFERENCES mentors (id) ON DELETE CASCADE
);

CREATE INDEX mentor_sign_in_links_mentor_id_idx ON mentor_sign_in_links (mentor_id);

-- Down Migration

DROP TABLE mentor_sign_in_links;
DROP TABLE mentor_sessions;
