# Upgrade notes – DevMentor

Jak przejść między wersjami i jak się wycofać. Każde wydanie z migracją bazy albo nową konfiguracją ma tu swoją sekcję. Zasady zmian łamiących: [BACKWARD_COMPATIBILITY.md](BACKWARD_COMPATIBILITY.md). Lista zmian: [CHANGELOG.md](CHANGELOG.md).

## 0.1.0 → 1.0.0

Zmiany łamiące: brak. Wydanie jest addytywne: nowa migracja, nowe trasy, nowe zadanie okresowe i jedna opcjonalna zmienna.

| Co | Zmiana | Działanie przy aktualizacji |
|---|---|---|
| Baza | migracja `0009_mentor_payouts.sql`: kolumna `payments.refund_seen_at` (nullable), tabele `mentor_payout_accounts` i `payouts` | `npm run db:migrate` przed startem nowej wersji |
| Zmienne | nowa opcjonalna `STRIPE_CONNECT_WEBHOOK_SECRET` | ustaw, jeśli dodajesz osobny Connect webhook; bez niej konta synchronizuje zadanie okresowe |
| Stripe | Connect webhook na ten sam adres `/api/webhooks/stripe`: `account.updated`, `transfer.created`, `transfer.reversed`, `transfer.updated` | dodaj w panelu Stripe (tryb testowy) |
| Zadania | nowe `payouts.transferOwed`; pola zdrowia `failedPayouts`, `payoutsNeedingAttention` w `/api/internal/jobs` | cron bez zmian (ta sama ścieżka), monitor może czytać nowe pola |
| Strony | nowa `/mentor/payouts`, zachęta do wypłat na `/mentor` | brak |

### Aktualizacja

Zanim zaczniesz: zrób kopię bazy (`pg_dump`), bo wycofanie migracji 0009 usuwa dane wypłat.

```powershell
git fetch --tags
git checkout v1.0.0
npm.cmd ci
npm.cmd run db:migrate      # wykona 0009_mentor_payouts
npm.cmd run build
npm.cmd run start
```

Sprawdzenie po aktualizacji: `/mentor` i `/mentor/payouts` po zalogowaniu mentora się otwierają, `GET /api/internal/jobs` (z `Bearer CRON_SECRET`) zwraca pola `failedPayouts` i `payoutsNeedingAttention`.

### Wycofanie do 0.1.0

Wycofanie jest bezpieczne tylko wtedy, gdy żadna wypłata nie była jeszcze próbowana. Migracja w dół 0009 sama to sprawdza i przerywa się błędem `0009 down: payout attempt may have moved money`, jeśli w `payouts` jest wiersz z `attempts > 0` albo z `stripe_transfer_id`. Wtedy nie wycofujemy schematu, tylko kod (patrz niżej) albo robimy poprawkę w przód.

Kolejność ma znaczenie: migrację cofamy kodem 1.0.0 (stary kod nie zna pliku 0009), dopiero potem przechodzimy na tag `v0.1.0`.

```powershell
# 1. Zatrzymaj aplikację i cron (żeby payouts.transferOwed nie ruszył transferów).
# 2. Na kodzie v1.0.0 cofnij jedną migrację:
npm.cmd run db:rollback     # 0009 w dół: usuwa payouts, mentor_payout_accounts, payments.refund_seen_at
# 3. Przejdź na poprzednią wersję:
git checkout v0.1.0
npm.cmd ci
npm.cmd run build
npm.cmd run start
```

Gdy migracja w dół odmówi (były próby wypłat): zostaw schemat 0009 i uruchom kod `v0.1.0` na tej bazie. Kod 0.1.0 nie czyta nowych tabel ani kolumny `refund_seen_at`, więc działa, ale wypłaty stoją do powrotu na 1.0. Nie usuwaj danych wypłat ręcznie.

Procedura została sprawdzona na kopii bazy przy wydaniu 1.0.0: `lekcja-22/karta-wydania.md`.
