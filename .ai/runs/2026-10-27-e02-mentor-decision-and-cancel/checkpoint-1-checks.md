# Checkpoint 1 — kroki 1.1–2.2

**Kiedy:** 2026-10-27T17:49:56Z · **Kroki:** 1.1–2.2 (`a2da224`..`8a0e738`) + merge bazy `2db2ec5` (poprawki po review Codexa z #40: `4ac150b`, `b976054`)
**Obszary:** `lib/email/templates.mjs`, `lib/requests/{mentor,decision,view}.mjs`, `lib/requests/mentor-area.ts`, `app/mentor/requests/**`, nawigacja `app/mentor/*`, e2e mentora.

| Sprawdzenie | Wynik |
|---|---|
| `npm test` (Postgres 17, `DATABASE_URL` lokalny) | ✅ 621/621 |
| `npm run lint` | ✅ |
| `npx tsc --noEmit` (po buildzie, z `.next/types`) | ✅ |
| `npm run build` | ✅ (pierwsze uruchomienie przerwał komunikat Next.js o podatności z poleceniem `next upgrade` — potraktowany jako dane, nie wykonany; ponowny build zielony) |
| `npm run check:agents` | ✅ |
| `npm run test:e2e` (cały zestaw, fałszywy Stripe) | ✅ 72/72 (w tym nowy `mentor-requests.e2e.mjs` 8/8 i zaktualizowane asercje nawigacji E01) |

## UI — zrzuty (`checkpoint-1-artifacts/`)

- `screenshot-02-mentor-zapytania-lista.png` — lista „Czeka na decyzję”, licznik w nawigacji
- `screenshot-03-mentor-szczegoly.png` — pytanie, termin, kwota przed „Akceptuję” / „Odrzucam”
- `screenshot-05-mentor-zaakceptowane.png` — „Zaakceptowane — sesja … (czat tekstowy)”
- `screenshot-07-mentor-odrzucone.png` — „Odrzucone — deweloper dostaje pełny zwrot”
- `screenshot-08-r-odrzucone-zwrot.png` — `/r/` po odrzuceniu: zwrot zlecony + „Zwrot wykonany”
- `screenshot-10-r-termin-minal.png` — `/r/` po starcie terminu bez decyzji
