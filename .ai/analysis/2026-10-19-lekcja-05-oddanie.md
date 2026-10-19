# Lekcja 05 — oddanie zadania domowego (2026-10-19)

## Co oddaję
8 specyfikacji do wszystkich pozycji epików E01 i E02 z naszego backlogu (lekcja 04). Każda przeszła ten sam proces: draft `om-spec-writing --autonomous` (Claude) → review innym modelem (GPT przez Codex CLI, `codex exec -s read-only`) → grill me (metoda „grilling” Matta Pococka) → poprawki → mój przegląd.

| Issue | Specyfikacja | Review GPT | Grill (pytania / ⚠) |
|---|---|---|---|
| #23 E01-S01-T01 | `.ai/specs/2026-10-19-data-store-and-first-schema-migration.md` | revise, 2 High → 6/6 przyjęte | 6 / 0 |
| #14 E01-S01 | `.ai/specs/2026-10-19-mentor-invitation-and-page-publishing.md` | revise, 1 High → 5 przyjęte, 1 zostaje ⚠ | 10 / 3 |
| #15 E01-S02 | `.ai/specs/2026-10-19-mentor-weekly-availability-and-open-slots.md` | revise, 3 High → 6 przyjęte, 2 odrzucone | 9 / 1 |
| #16 E01-S03 | `.ai/specs/2026-10-19-public-mentor-share-page.md` | revise, 2 High → 5/5 przyjęte | 8 / 0 |
| #24 E02-S01-T01 | `.ai/specs/2026-10-19-stripe-card-payment-refund-and-webhook.md` | revise, 1 Critical + 6 High → 9 przyjętych, 2 częściowo | 14 / 3 |
| #17 E02-S01 | `.ai/specs/2026-10-19-prepaid-request-with-question.md` | revise, 3 High → 5 przyjętych, 1 odrzucona | 11 / 1 |
| #18 E02-S02 | `.ai/specs/2026-10-19-mentor-accepts-or-declines-request.md` | revise, 2 High → wszystkie przyjęte | 8 / 0 |
| #19 E02-S03 | `.ai/specs/2026-10-19-developer-cancels-before-acceptance.md` | revise (sprzeczność z D05) → 3/3 przyjęte | 5 / 1 |

Review i logi grill: `.ai/specs/reviews/*.review-gpt.md`, `.ai/specs/reviews/*.grill.md`. Każda specka kończy się sekcją „🔍 Review & grill outcome” (co przyjęte, co odrzucone/wycięte i dlaczego).

## Jak powstały decyzje
- Odpowiedzi w grill me = rekomendacje agenta, przyjęte na moją ogólną zgodę („zrób wszystko za mnie”, 2026-10-19). Wszystko, co dotyka otwartych pytań z briefu, zostało oznaczone ⚠.
- Wspólne decyzje między speckami (ustalone przez koordynatora, żeby specki się nie rozjechały): jedna stała `MIN_NOTICE_MINUTES = 180` (#15); siatka :00/:30 w strefie mentora, zapis w UTC; atomowe zajęcie terminu przy tworzeniu zgłoszenia (#17); anulowanie do akceptacji mentora (D05); minimalne maile transakcyjne przez jeden adapter (#17), żeby mentor dowiedział się o zgłoszeniu (ryzyko A01); tokeny linków ≥128 bit, hashowane, GET nie zużywa tokenu; numeracja migracji 0001–0006.
- Grill me nie został zainstalowany w repo (`npx skills add` zablokowane przez zabezpieczenie jako obcy kod); metodę zastosowano bez instalacji.

## ⚠ Do mojej decyzji przed implementacją
1. **Waluta PLN** (Q02) — #14, #24.
2. **Obie długości 25 i 50 min obowiązkowe** — #14, #15.
3. **Cena wpisana przez mentora = kwota płacona, prowizja w env `PLATFORM_COMMISSION_BPS`** (Q01) — #14, #24.
4. **Opłaty Stripe za zwroty ponosi platforma** — #24.
5. **Spory/chargebacki tylko rejestrowane, obsługa ręczna w Stripe; nieudany zwrot po 24 h — ręcznie** (Q05, brak właściciela) — #24, #19.
6. **Gość bez konta (prywatny link `/r/{token}`)** zamiast konta mentee — #17, #19.
7. **Minimalne wyprzedzenie 3 h** vs oczekiwanie szybkiej pomocy (A01) — #15, #17.
8. **Linki logowania mentora wydaje founder komendą** (albo mailem przez adapter z #17) — #14.
9. **Hosting i harmonogram zadań** (`/api/internal/jobs` co 5 min) — fundament Q8.
10. **pg + node-pg-migrate bez ORM** — przyjęte (Q1 fundamentu), do potwierdzenia przez tech leada przy review PR.

## Mój przegląd
- Specki są długie (razem ~18,7 tys. słów; #24 ~3,4 tys.). Lekcja mówi „dłuższa ≠ lepsza”. Akceptuję, bo E02 to pieniądze i wyścigi (risk-high), ale przy implementacji agent powinien dostawać jedną speckę naraz, a nie cały komplet.
- Najcenniejsze z review innym modelem: blokada zwrotu obejmująca wywołanie Stripe (#24, Critical), sprzeczność anulowania z D05 (#19), niezdefiniowana strefa siatki terminów (#15), brak powiązania e-maila zaproszenia z mentorem (#23).
- Odrzucone świadomie: wydzielenie silnika terminów do osobnej specki (#15), podział maszyny stanów zgłoszenia (#17), narzędzie do ponownego kolejkowania zwrotów (#24 — brak właściciela Q05).

## Od czego zaczynam
#23 (fundament bazy) → #14 → #15 → #16, zgodnie z priorytetem `priority-high` z lekcji 04. Następna lekcja (design system i mockupy) weźmie te specki jako wejście dla `om-mockup-prototype`.
