-- 0005: płatności kartą przez Stripe (tryb testowy), jeden pełny zwrot na płatność, dziennik zdarzeń webhooka
-- i ostatnie uruchomienia zadań okresowych (spec #24, Data Model; Implementation Plan krok 2).
--
-- Przejścia tylko do przodu i zawsze strzeżone w UPDATE (`WHERE status = 'pending'` itd.) — robi to aplikacja
-- (`lib/payments`). Baza pilnuje reguł, których złamanie oznaczałoby utratę pieniędzy albo podwójny zwrot.
-- Bez FK do zapytań: to zapytania wskazują płatności (#17, migracja 0006). Brak danych karty — tylko id Stripe.
-- `updated_at` ustawia aplikacja (bez triggerów), jak w 0001.

-- Up Migration

CREATE TABLE payments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'pending',
  amount_minor integer NOT NULL,
  currency text NOT NULL,
  -- Migawka prowizji platformy z chwili płatności (Q3); E02 jej nie używa, wypłaty (#22/#25) czytają ją stąd.
  commission_bps integer NOT NULL,
  stripe_checkout_session_id text,
  -- URL otwartej sesji: powtórzone „Zapłać” (#17) dostaje ten sam adres bez wywołania Stripe.
  stripe_checkout_url text,
  stripe_payment_intent_id text,
  checkout_expires_at timestamptz NOT NULL,
  -- Dane osobowe z Checkout; nigdy pokazywane mentorowi. Używane przez #17 do e-maili dewelopera.
  payer_email text,
  succeeded_at timestamptz,
  expired_at timestamptz,
  refund_status text,
  refund_reason text,
  stripe_refund_id text,
  refund_requested_at timestamptz,
  refunded_at timestamptz,
  -- Dzierżawa zwrotu: każde zajęcie podbija licznik prób; zapis wyniku jest strzeżony numerem próby.
  refund_attempts integer NOT NULL DEFAULT 0,
  refund_lease_until timestamptz,
  refund_next_attempt_at timestamptz,
  -- Tylko kod błędu Stripe i id żądania Stripe — nigdy treść komunikatu (może powtarzać dane wejściowe).
  refund_last_error text,
  disputed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payments_pkey PRIMARY KEY (id),
  CONSTRAINT payments_stripe_checkout_session_id_key UNIQUE (stripe_checkout_session_id),
  CONSTRAINT payments_stripe_payment_intent_id_key UNIQUE (stripe_payment_intent_id),
  CONSTRAINT payments_stripe_refund_id_key UNIQUE (stripe_refund_id),
  CONSTRAINT payments_status_known CHECK (status IN ('pending', 'succeeded', 'expired')),
  CONSTRAINT payments_amount_positive CHECK (amount_minor > 0),
  CONSTRAINT payments_currency_format CHECK (currency ~ '^[A-Z]{3}$'),
  CONSTRAINT payments_commission_bps_range CHECK (commission_bps BETWEEN 0 AND 10000),
  CONSTRAINT payments_succeeded_has_time CHECK ((status = 'succeeded') = (succeeded_at IS NOT NULL)),
  CONSTRAINT payments_expired_has_time CHECK ((status = 'expired') = (expired_at IS NOT NULL)),
  CONSTRAINT payments_refund_status_known CHECK (
    refund_status IS NULL OR refund_status IN ('requested', 'pending', 'succeeded', 'failed')
  ),
  -- Zwrot tylko z opłaconej płatności.
  CONSTRAINT payments_refund_only_succeeded CHECK (refund_status IS NULL OR status = 'succeeded'),
  CONSTRAINT payments_refund_reason_known CHECK (
    refund_reason IS NULL
    OR refund_reason IN ('mentor_declined', 'lapsed', 'mentee_cancelled', 'invalid_on_payment', 'external', 'mentor_no_show')
  ),
  -- Zlecony zwrot zawsze ma powód i chwilę zlecenia.
  CONSTRAINT payments_refund_has_reason CHECK (
    (refund_status IS NULL) = (refund_reason IS NULL) AND (refund_status IS NULL) = (refund_requested_at IS NULL)
  ),
  CONSTRAINT payments_refunded_has_time CHECK ((refund_status = 'succeeded') = (refunded_at IS NOT NULL)),
  CONSTRAINT payments_refund_attempts_non_negative CHECK (refund_attempts >= 0)
);

-- Zadanie ponawiania zwrotów: zlecone i oczekujące u Stripe.
CREATE INDEX payments_refund_due_idx ON payments (refund_next_attempt_at)
  WHERE refund_status IN ('requested', 'pending');

-- Rekonsyliacja: płatności czekające na wynik Checkout.
CREATE INDEX payments_pending_idx ON payments (checkout_expires_at)
  WHERE status = 'pending';

-- Zdarzenia webhooka Stripe: wiersz istnieje tylko wtedy, gdy przetworzenie zdarzenia zostało zatwierdzone
-- (wstawiany w tej samej transakcji co przejście stanu) — powtórzone zdarzenie nie jest przetwarzane drugi raz.
CREATE TABLE stripe_events (
  event_id text NOT NULL,
  type text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT stripe_events_pkey PRIMARY KEY (event_id)
);

-- Ostatnie uruchomienie każdego zadania okresowego (zdrowie: `GET /api/internal/jobs`).
CREATE TABLE job_runs (
  name text NOT NULL,
  last_run_at timestamptz NOT NULL,
  last_error text,
  CONSTRAINT job_runs_pkey PRIMARY KEY (name)
);

-- Down Migration

-- Tylko dev/test: po pierwszych danych pilotażu poprawki wyłącznie migracją w przód.
DROP TABLE job_runs;

DROP TABLE stripe_events;

DROP TABLE payments;
