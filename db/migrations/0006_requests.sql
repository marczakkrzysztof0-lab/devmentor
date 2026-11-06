-- 0006: zapytania opłacone z góry i wspólny outbox e-maili (spec #17, Data Model; Implementation Plan krok 1).
--
-- Cała maszyna stanów zapytania E02 jako jawny kontrakt między specyfikacjami — #18 i #19 dodają przejścia,
-- nie migracje podmieniające CHECK:
--   (nowe) → awaiting_payment → awaiting_mentor | payment_failed   (#17)
--   awaiting_mentor → accepted | declined | lapsed                (#18)
--   awaiting_mentor → cancelled                                   (#19)
-- Kwota i waluta są tylko na `payments`. Pytanie zapisane jako tekst (bez trim w bazie — trim robi aplikacja),
-- widoczne wyłącznie dla dwóch stron (R04); nigdy w e-mailach, Stripe ani logach.
-- Zajęcie terminu: bez exclusion constraint (wymagałby btree_gist) — nakładanie wyklucza blokada wiersza `mentors`
-- w transakcji tworzenia zapytania i w subskrybencie płatności (lib/requests).

-- Up Migration

CREATE TABLE requests (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  mentor_id uuid NOT NULL,
  payment_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'awaiting_payment',
  length_minutes integer NOT NULL,
  slot_start timestamptz NOT NULL,
  slot_end timestamptz NOT NULL,
  mentee_name text NOT NULL,
  question text NOT NULL,
  -- Tylko SHA-256 tokenu z linku /r/{token}; sam token nie jest przechowywany.
  access_token_hash text NOT NULL,
  -- Id próby wysłania generowane w przeglądarce: powtórzone „Zapłać” nie tworzy drugiego zapytania.
  submission_id uuid NOT NULL,
  paid_at timestamptz,
  accepted_at timestamptz,
  declined_at timestamptz,
  lapsed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT requests_pkey PRIMARY KEY (id),
  CONSTRAINT requests_mentor_id_fkey FOREIGN KEY (mentor_id) REFERENCES mentors (id) ON DELETE RESTRICT,
  CONSTRAINT requests_payment_id_fkey FOREIGN KEY (payment_id) REFERENCES payments (id) ON DELETE RESTRICT,
  CONSTRAINT requests_payment_id_key UNIQUE (payment_id),
  CONSTRAINT requests_access_token_hash_key UNIQUE (access_token_hash),
  CONSTRAINT requests_submission_id_key UNIQUE (submission_id),
  CONSTRAINT requests_status_known CHECK (
    status IN ('awaiting_payment', 'awaiting_mentor', 'payment_failed', 'accepted', 'declined', 'lapsed', 'cancelled')
  ),
  -- R01: sesje 25 albo 50 minut.
  CONSTRAINT requests_length_known CHECK (length_minutes IN (25, 50)),
  CONSTRAINT requests_slot_end_matches CHECK (slot_end = slot_start + length_minutes * interval '1 minute'),
  CONSTRAINT requests_mentee_name_length CHECK (char_length(btrim(mentee_name)) BETWEEN 2 AND 80),
  -- R05: pytanie 20–4000 znaków po obcięciu białych znaków.
  CONSTRAINT requests_question_length CHECK (char_length(btrim(question)) BETWEEN 20 AND 4000),
  -- Opłacone zapytanie ma chwilę opłacenia.
  CONSTRAINT requests_paid_has_time CHECK (
    status IN ('awaiting_payment', 'payment_failed') OR paid_at IS NOT NULL
  )
);

-- Zajęte przedziały mentora (stany trzymające termin).
CREATE INDEX requests_mentor_slot_holding_idx ON requests (mentor_id, slot_start)
  WHERE status IN ('awaiting_payment', 'awaiting_mentor', 'accepted');

-- Wspólny outbox e-maili (adapter `lib/email`, używany też przez #18, #19, #14).
CREATE TABLE outbound_emails (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  -- NULL tylko w szkicu (adres dewelopera znany dopiero ze Stripe).
  to_address text,
  template text NOT NULL,
  -- Parametry szablonu; zerowane po wysłaniu albo porażce (link /r/ jest tu tylko do wysłania — minuty).
  params jsonb,
  status text NOT NULL DEFAULT 'due',
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz,
  lease_until timestamptz,
  sent_at timestamptz,
  -- Tylko kod błędu dostawcy, bez treści.
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT outbound_emails_pkey PRIMARY KEY (id),
  CONSTRAINT outbound_emails_status_known CHECK (status IN ('draft', 'due', 'sent', 'failed')),
  CONSTRAINT outbound_emails_recipient_unless_draft CHECK (status = 'draft' OR to_address IS NOT NULL),
  CONSTRAINT outbound_emails_sent_has_time CHECK ((status = 'sent') = (sent_at IS NOT NULL)),
  CONSTRAINT outbound_emails_params_cleared CHECK (status IN ('draft', 'due') OR params IS NULL),
  CONSTRAINT outbound_emails_attempts_non_negative CHECK (attempts >= 0)
);

-- Zadanie `email.sendDue`: e-maile do wysłania, w kolejności terminu.
CREATE INDEX outbound_emails_due_idx ON outbound_emails (next_attempt_at) WHERE status = 'due';

-- Down Migration

-- Tylko dev/test: po pierwszych danych pilotażu poprawki wyłącznie migracją w przód.
DROP TABLE outbound_emails;

DROP TABLE requests;
