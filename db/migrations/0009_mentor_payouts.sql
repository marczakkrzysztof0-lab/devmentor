-- Wypłaty mentorów i wykrywanie zwrotów po transferze (spec 2026-11-09).
-- Jeden rekord na zapytanie (unikalne request_id); paid zawsze ma identyfikator transferu Stripe.
-- Cofnięcie odmawia, gdy podjęto próbę wypłaty, bo transfer mógł już przenieść pieniądze.
-- Up Migration
ALTER TABLE payments ADD COLUMN refund_seen_at timestamptz;

CREATE TABLE mentor_payout_accounts (
  mentor_id uuid PRIMARY KEY REFERENCES mentors(id) ON DELETE RESTRICT,
  stripe_account_id text UNIQUE,
  create_key_version integer NOT NULL DEFAULT 1 CHECK (create_key_version >= 1),
  payouts_enabled boolean NOT NULL DEFAULT false,
  transfers_active boolean NOT NULL DEFAULT false,
  details_submitted boolean NOT NULL DEFAULT false,
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','ready')),
  CHECK ((state = 'ready') = (payouts_enabled AND transfers_active)),
  last_event_created timestamptz,
  checked_at timestamptz,
  CHECK (stripe_account_id IS NOT NULL OR state = 'pending'),
  resync_requested_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL UNIQUE REFERENCES requests(id) ON DELETE RESTRICT,
  mentor_id uuid NOT NULL REFERENCES mentors(id) ON DELETE RESTRICT,
  payment_id uuid NOT NULL REFERENCES payments(id) ON DELETE RESTRICT,
  amount_minor integer NOT NULL CHECK (amount_minor > 0),
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  status text NOT NULL DEFAULT 'held_for_payout' CHECK (status IN ('held_for_payout','transferring','paid','failed','cancelled')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  key_version integer NOT NULL DEFAULT 1 CHECK (key_version >= 1),
  key_bump_due boolean NOT NULL DEFAULT false,
  lease_until timestamptz,
  next_attempt_at timestamptz,
  stripe_transfer_id text UNIQUE,
  last_error text,
  manual_reason text CHECK (manual_reason IS NULL OR manual_reason IN ('refunded_after_payout','transfer_reversed')),
  paid_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((status = 'paid') = (paid_at IS NOT NULL)),
  CHECK ((status = 'paid') <= (stripe_transfer_id IS NOT NULL)),
  CHECK ((status = 'cancelled') = (cancelled_at IS NOT NULL))
);
CREATE INDEX payouts_mentor_idx ON payouts (mentor_id, status);
CREATE INDEX payouts_open_idx ON payouts (status, next_attempt_at) WHERE status IN ('held_for_payout','failed');
CREATE INDEX payouts_transferring_idx ON payouts (lease_until) WHERE status = 'transferring';

-- Down Migration
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM payouts WHERE attempts > 0 OR stripe_transfer_id IS NOT NULL) THEN
    RAISE EXCEPTION '0009 down: payout attempt may have moved money';
  END IF;
END $$;
DROP TABLE payouts;
DROP TABLE mentor_payout_accounts;
ALTER TABLE payments DROP COLUMN refund_seen_at;
