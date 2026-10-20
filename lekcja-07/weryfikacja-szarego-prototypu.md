# Ręczna weryfikacja szarego prototypu (revision-001) — 2026-10-20

Skill `om-mockup-prototype` skończył z `Verification: not-run` (brak skonfigurowanego `agent-browser`, a skill nie dopuszcza innej przeglądarki). Przepływ przeszedł ręcznie agent-koordynator we wbudowanej przeglądarce (prototyp serwowany lokalnie, 1024 × 768, jasny motyw). To NIE jest test z prawdziwą osobą spoza projektu.

## Ścieżka bez błędów — przeszła

1. Zaproszenie → „Akceptuję zaproszenie” → edytor strony.
2. Wysłanie pustego formularza: 6 komunikatów błędów przy polach, fokus na pierwszym błędnym polu (`f-name`).
3. Wypełnienie (Anna K., link, opis, 150 / 280 zł): slug podpowiedziany z imienia (`anna-k`) → „Opublikuj” → „Strona opublikowana” z linkiem `devmentor.example/m/anna-k` i „Kopiuj link”.
4. Dostępność: wt i czw 18:00–20:00 → podgląd 16 startów slotów w 14 dniach; 19:30 tylko 25 min (okno kończy się o 20:00) — zgodnie z #15.
5. „Symuluj nowe opłacone zapytanie” → lista zapytań z banerem „Ustaw wypłaty przed pierwszą wypłatą” → szczegóły (pytanie, 50 min, slot, 280 zł) → „Akceptuję” → „Przyjęte — sesja zarezerwowana (czat tekstowy)”.

## Uwagi (do decyzji / mapy)

| # | Ekran | Co widać | Dlaczego to ważne |
|---|---|---|---|
| W1 | Edytor | Pole linku do pracy ma nazwę dostępną „https://” (placeholder zamiast powiązanej etykiety) | Czytnik ekranu nie ogłosi „Link do publicznej pracy”; prototyp z DS (ćw. 2b) używa FormField, więc to tylko szary prototyp |
| W2 | Edytor | „Co zrobiłeś / zrobiłaś”, „z czym realnie pracowałeś” | Niezgodne z zasadą C12 design systemu (teksty bez form zależnych od płci; DS ma „Twoje doświadczenie”) |
| W3 | Dostępność | Symulowane „teraz” = pon 26.10.2026 09:00 | Mapa ekranów (ćw. 1) przyjęła pon 19.10.2026 19:00 — dwa różne zegary demo |
| W4 | Dostępność | Nagłówek kolumny „Błąd” w tabeli okien bez treści | Pusty nagłówek myli; błąd powinien być przy wierszu, a nie jako kolumna |

## Nie sprawdzone

Klawiatura poza fokusem po walidacji, 320 px, ciemny motyw, stany odrzucenia / wygaśnięcia / wycofania i przerwanej konfiguracji wypłat (kontrolki „Test state” istnieją), zachowanie bez JS.
