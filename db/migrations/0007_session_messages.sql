-- 0007: wiadomości czatu sesji (spec #20 Data Model; Implementation Plan krok 1).
--
-- Sesja = zaakceptowane zapytanie (`requests.id`, kontrakt #18) — bez osobnej tabeli sesji. Wiadomość jest
-- niezmienna (bez edycji i usuwania, Q4): to dowód dla reguły nieobecności #21 (R15), więc `created_at` ustawia
-- zawsze serwer — czas bazy odczytany po zajęciu blokady wiersza zapytania (`clock_timestamp()`; w testach
-- wstrzyknięty), nigdy klient.
-- `seq` to kursor odpytywania: zapis wiadomości trzyma `FOR UPDATE` na wierszu zapytania, więc w obrębie jednej
-- sesji kolejność `seq` = kolejność zatwierdzeń (odpytujący nie przeskoczy wiadomości).
-- Treść to prywatna treść sesji (R04, A08): czytana tylko przez dwie strony; nigdy w e-mailach ani logach.

-- Up Migration

CREATE TABLE session_messages (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  seq bigint GENERATED ALWAYS AS IDENTITY,
  request_id uuid NOT NULL,
  author text NOT NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT session_messages_pkey PRIMARY KEY (id),
  CONSTRAINT session_messages_seq_key UNIQUE (seq),
  CONSTRAINT session_messages_request_id_fkey FOREIGN KEY (request_id) REFERENCES requests (id) ON DELETE RESTRICT,
  -- Rola, nie osoba: strona sesji wynika z poświadczenia (token /r/ albo sesja mentora), nigdy z klienta.
  CONSTRAINT session_messages_author_known CHECK (author IN ('mentor', 'mentee')),
  -- 1–4000 znaków po obcięciu białych znaków (jak pytanie, #17); zapisywana tak, jak wysłana.
  CONSTRAINT session_messages_body_length CHECK (char_length(btrim(body)) BETWEEN 1 AND 4000)
);

CREATE INDEX session_messages_request_seq_idx ON session_messages (request_id, seq);

-- Down Migration

-- Tylko dev/test: po pierwszych danych pilotażu poprawki wyłącznie migracją w przód.
DROP TABLE session_messages;
