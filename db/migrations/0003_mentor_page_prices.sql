-- 0003: ceny i waluta strony mentora (spec #14, Data Model „mentor_pages — new columns”, faza 2; Q2, Q3).
-- Ceny w jednostkach podrzędnych (grosze), jak w Stripe (#24); #16 i #17 czytają dokładnie te nazwy kolumn.
-- Aplikacja przyjmuje pełne złote 20–5000; baza pilnuje tylko `> 0`.
-- `published_requires_content` zostaje zastąpione wersją wymagającą też obu cen (Q3).

-- Up Migration

-- Strażnik: zastąpienie CHECK-a publikacji to ZAWĘŻENIE (BACKWARD_COMPATIBILITY.md, schemat bazy).
-- Jednym krokiem jest bezpieczne tylko wtedy, gdy nie ma żadnej opublikowanej strony (brak wdrożeń).
-- Ten stan jest dziś niemożliwy: publikacja stron powstaje dopiero w tej samej fazie (#14, faza 2), a bazy
-- produkcyjnej nie ma — strażnik tylko zatrzymuje migrację, gdyby założenie przestało być prawdziwe (review fazy 3).
-- Gdyby kiedyś trzeba było podobnie zawęzić CHECK przy istniejących opublikowanych stronach, robimy to w DWÓCH
-- krokach: (1) osobna migracja / krok danych PRZED zaostrzeniem — uzupełnić brakujące dane (tu: ceny) opublikowanych
-- stron albo je odpublikować; (2) dopiero potem zastąpić CHECK.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM mentor_pages WHERE published_at IS NOT NULL) THEN
    RAISE EXCEPTION '0003_mentor_page_prices: istnieją opublikowane strony mentorów (published_at IS NOT NULL). Zastąpienie CHECK published_requires_content wersją z cenami to zawężenie, bezpieczne tylko bez opublikowanych wierszy. Zamiast tej migracji wdróż zmianę w dwóch krokach: dodaj kolumny cen → uzupełnij ceny opublikowanych stron → dopiero potem zaostrz CHECK.'
      USING ERRCODE = 'check_violation';
  END IF;
END
$$;

ALTER TABLE mentor_pages
  ADD COLUMN price_25_minor integer,
  ADD COLUMN price_50_minor integer,
  ADD COLUMN currency text NOT NULL DEFAULT 'PLN',
  -- NULL = cena jeszcze nie podana (szkic).
  ADD CONSTRAINT mentor_pages_price_25_minor_positive CHECK (price_25_minor > 0),
  ADD CONSTRAINT mentor_pages_price_50_minor_positive CHECK (price_50_minor > 0),
  -- Kod ISO 4217; dziś zawsze PLN, mentor go nie wybiera (Q2).
  ADD CONSTRAINT mentor_pages_currency_format CHECK (currency ~ '^[A-Z]{3}$');

ALTER TABLE mentor_pages DROP CONSTRAINT published_requires_content;

-- R03 + R07/Q3: opublikowana strona ma nazwę, link do publicznej pracy, opis (nie same białe znaki)
-- oraz obie ceny (25 i 50 minut).
ALTER TABLE mentor_pages ADD CONSTRAINT published_requires_content CHECK (
  published_at IS NULL
  OR (
    length(btrim(coalesce(display_name, ''), E' \t\r\n\f')) > 0
    AND length(btrim(coalesce(public_work_url, ''), E' \t\r\n\f')) > 0
    AND length(btrim(coalesce(description, ''), E' \t\r\n\f')) > 0
    AND price_25_minor IS NOT NULL
    AND price_50_minor IS NOT NULL
  )
);

-- Down Migration

-- Przywraca słabszą regułę z 0001 (#23) dokładnie w tamtym brzmieniu; nie może się nie powieść.
ALTER TABLE mentor_pages DROP CONSTRAINT published_requires_content;

ALTER TABLE mentor_pages ADD CONSTRAINT published_requires_content CHECK (
  published_at IS NULL
  OR (
    length(btrim(coalesce(display_name, ''), E' \t\r\n\f')) > 0
    AND length(btrim(coalesce(public_work_url, ''), E' \t\r\n\f')) > 0
    AND length(btrim(coalesce(description, ''), E' \t\r\n\f')) > 0
  )
);

-- Usunięcie kolumn usuwa też ich CHECK-i.
ALTER TABLE mentor_pages
  DROP COLUMN currency,
  DROP COLUMN price_50_minor,
  DROP COLUMN price_25_minor;
