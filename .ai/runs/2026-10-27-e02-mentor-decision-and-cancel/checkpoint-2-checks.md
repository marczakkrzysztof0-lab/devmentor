# Checkpoint 2 — kroki 3.1–4.3

**Kiedy:** 2026-10-27T18:04:32Z · **Kroki:** 3.1–4.3 (`093f2fc`..`75e4810`) — zamknięcie fazy 4 (#19)
**Obszary:** `lib/requests/{lapse,cancel}.mjs`, `lib/jobs/registry.mjs`, `lib/requests/server.ts`, `app/r/[token]/*`, testy DB wyścigów, e2e anulowania.

| Sprawdzenie | Wynik |
|---|---|
| `npm test` (Postgres 17) | ✅ 642/642 (w tym `requests-lapse` 8, `requests-cancel` 6, `requests-cancel-race` 7 — race testy 3× bez flakowania) |
| `npm run lint` | ✅ |
| `npx tsc --noEmit` | ✅ |
| `npm run build` | ✅ |
| `npm run check:agents` | ✅ |
| `npm run test:e2e` (cały zestaw, fałszywy Stripe) | ✅ 77/77 (nowy `request-cancel.e2e.mjs` 5/5) |

## UI — zrzuty (`checkpoint-2-artifacts/`)

- `screenshot-12-r-oplacone-z-anulowaniem.png` — „Anuluj i odzyskaj 150 zł”, „Możesz anulować, dopóki mentor nie zaakceptuje.”
- `screenshot-13-r-potwierdzenie-anulowania.png` — potwierdzenie z konsekwencją
- `screenshot-14-r-anulowane-zwrot.png` — „Anulowane — zwrot 150 zł zlecony” + „Zwrot wykonany”
- `screenshot-15-mentor-lista-anulowane.png` — u mentora „Zakończone — anulowane”
- `screenshot-16-r-zaakceptowane-bez-anulowania.png` — po akceptacji bez przycisku
- `screenshot-17-r-wyscig-zaakceptowane.png` — stara karta: „Pytanie zostało właśnie zaakceptowane — sesja się odbędzie”
