-- 0008: wynik sesji po terminie (spec #21 Data Model; Implementation Plan krok 1).
--
-- Trzy końcowe stany zapytania po zaakceptowanej sesji (reguła R15 + D11, zadanie `sessions.settleEnded`):
--   accepted → held              obie strony pisały w terminie — sesja odbyta, bez zwrotu
--   accepted → mentee_no_show    pisał tylko mentor — płatność zostaje u mentora (R15)
--   accepted → mentor_no_show    mentor nie pisał (także gdy nikt nie pisał, D11) — pełny zwrot `mentor_no_show`
-- `settled_at` jest ustawiony dokładnie w tych stanach (dla `accepted` zawsze NULL); „sesja zakończona — rozliczamy”
-- to tylko stan pochodny (accepted + slot_end <= now), nigdy zapisany. Powód zwrotu `mentor_no_show` jest w 0005.
-- Kontrakt dla #22: zarobione przez mentora = płatności zapytań w `held` albo `mentee_no_show`.

-- Up Migration

ALTER TABLE requests ADD COLUMN settled_at timestamptz;

ALTER TABLE requests DROP CONSTRAINT requests_status_known;
ALTER TABLE requests ADD CONSTRAINT requests_status_known CHECK (
  status IN ('awaiting_payment', 'awaiting_mentor', 'payment_failed', 'accepted', 'declined', 'lapsed', 'cancelled',
             'held', 'mentee_no_show', 'mentor_no_show')
);

ALTER TABLE requests ADD CONSTRAINT requests_settled_has_time CHECK (
  (status IN ('held', 'mentee_no_show', 'mentor_no_show')) = (settled_at IS NOT NULL)
);

-- Zadanie rozliczenia: zaakceptowane sesje w kolejności końca terminu.
CREATE INDEX requests_accepted_slot_end_idx ON requests (slot_end) WHERE status = 'accepted';

-- Down Migration

-- Tylko dev/test: po pierwszych rozliczeniach cofnięcie zgubiłoby wynik sesji (i podstawę wypłat #22) — odmawiamy.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM requests WHERE status IN ('held', 'mentee_no_show', 'mentor_no_show')) THEN
    RAISE EXCEPTION '0008 down: istnieją rozliczone sesje (held / mentee_no_show / mentor_no_show) — poprawka tylko migracją w przód';
  END IF;
END
$$;

DROP INDEX requests_accepted_slot_end_idx;

ALTER TABLE requests DROP CONSTRAINT requests_settled_has_time;
ALTER TABLE requests DROP CONSTRAINT requests_status_known;
ALTER TABLE requests ADD CONSTRAINT requests_status_known CHECK (
  status IN ('awaiting_payment', 'awaiting_mentor', 'payment_failed', 'accepted', 'declined', 'lapsed', 'cancelled')
);

ALTER TABLE requests DROP COLUMN settled_at;
