-- 0004: tygodniowa dostępność mentora (spec #15, Data Model, Implementation Plan krok 1; Q2).
-- Okna to czas ścienny w strefie mentora (`mentors.time_zone`, IANA); terminy liczy aplikacja
-- (`lib/availability/slots.mjs`) i porównuje jako chwile UTC.
-- Okna nie przechodzą przez północ (koniec najpóźniej 1440 = 24:00 tego samego dnia).
-- Nakładanie się okien jest dozwolone (bez exclusion constraint) — aplikacja łączy okna przy liczeniu terminów.

-- Up Migration

-- NULL do pierwszego zapisu dostępności. Poprawność strefy (Intl.supportedValuesOf('timeZone')) sprawdza
-- aplikacja; baza pilnuje tylko, żeby nie była pusta. Nie jest publiczna.
ALTER TABLE mentors
  ADD COLUMN time_zone text,
  ADD CONSTRAINT mentors_time_zone_not_blank CHECK (length(btrim(time_zone)) > 0);

CREATE TABLE availability_windows (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  mentor_id uuid NOT NULL,
  -- ISO 8601: poniedziałek = 1 … niedziela = 7.
  weekday smallint NOT NULL,
  -- Minuty od północy, siatka 30 minut; okno trwa co najmniej 30 minut.
  start_minute smallint NOT NULL,
  end_minute smallint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT availability_windows_pkey PRIMARY KEY (id),
  CONSTRAINT availability_windows_mentor_id_fkey FOREIGN KEY (mentor_id)
    REFERENCES mentors (id) ON DELETE CASCADE,
  CONSTRAINT availability_windows_weekday_range CHECK (weekday BETWEEN 1 AND 7),
  CONSTRAINT availability_windows_start_minute_grid CHECK (start_minute BETWEEN 0 AND 1410 AND start_minute % 30 = 0),
  CONSTRAINT availability_windows_end_minute_grid CHECK (end_minute BETWEEN 30 AND 1440 AND end_minute % 30 = 0),
  CONSTRAINT availability_windows_end_after_start CHECK (end_minute > start_minute)
);

CREATE INDEX availability_windows_mentor_id_idx ON availability_windows (mentor_id);

-- Down Migration

-- Usunięcie tabeli usuwa też jej indeks i ograniczenia; usunięcie kolumny — jej CHECK.
DROP TABLE availability_windows;

ALTER TABLE mentors DROP COLUMN time_zone;
