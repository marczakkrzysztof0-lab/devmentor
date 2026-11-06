# Lekcja 17, ćwiczenie 3 — branch protection dla `main`

> **Status: przygotowane, NIE zastosowane.** Ustawień repo nie zmieniałem. Polecenie uruchamia Krzysztof po akceptacji.

## Stan obecny (odczyt 2026-11-03)

`gh api repos/marczakkrzysztof0-lab/devmentor/branches/main/protection` → `404 Branch not protected` (klasyczna ochrona gałęzi nieużywana).

`gh api repos/marczakkrzysztof0-lab/devmentor/rulesets` → jeden ruleset **„protect main”** (id `25068859`, `active`, cel `~DEFAULT_BRANCH`, bez `bypass_actors`):

| Reguła | Jest | Brakuje względem lekcji |
|---|---|---|
| `deletion` (blokada usunięcia) | tak | — |
| `non_fast_forward` (blokada force push) | tak | — |
| `required_status_checks` | tylko `test` | `lint`, `build`, `e2e`, `tokens`, `storybook`, `date-guards` |
| `pull_request` (PR wymagany, approve, wątki) | **nie** | cała reguła — dziś można pushować prosto do `main` |
| bypass | brak | Repository admin tylko przez PR |

Ostatni przebieg CI na `main` (`a4812a3`, 2026-10-30): wszystkie joby zielone (`lint`, `build`, `test`, `e2e`, `tokens`, `storybook`), więc wymaganie ich nie zablokuje bieżących PR-ów. `date-guards` to nowy job z PR lekcji 17 — dodać do wymaganych dopiero **po scaleniu** tego PR (inaczej PR-y bez tego joba czekałyby na check, który się nie uruchomi).

## Docelowy ruleset „main”

Plik: [`ruleset-main.json`](ruleset-main.json)

- PR wymagany do `main`, **1 approve**, **approve ostatniego pusha** (`require_last_push_approval`), stare approve unieważniane po nowym pushu (`dismiss_stale_reviews_on_push`), **wszystkie wątki rozwiązane** (`required_review_thread_resolution`).
- Blokada usuwania gałęzi i force pusha.
- Wymagane checki (GitHub Actions, `integration_id` 15368): `lint`, `build`, `test`, `e2e`, `tokens`, `storybook`, `date-guards`.
- Bypass: rola **Repository admin** (`actor_id` 5) w trybie **`pull_request`** — admin może scalić z pominięciem wymagań, ale tylko przez PR, nigdy pushem prosto na `main`. Bez tego repo jednoosobowe by się zablokowało: GitHub nie pozwala zatwierdzić własnego PR, więc wymóg 1 approve byłby nie do spełnienia.

## Polecenie (PowerShell, z katalogu repo)

```powershell
cd C:\Users\KMarczak\projekty\devmentor
# 1. podgląd, co zostanie wysłane
Get-Content lekcja-17\ruleset-main.json
# 2. utworzenie rulesetu „main”
gh api --method POST repos/marczakkrzysztof0-lab/devmentor/rulesets --input lekcja-17/ruleset-main.json
# 3. sprawdzenie
gh api repos/marczakkrzysztof0-lab/devmentor/rulesets
gh api repos/marczakkrzysztof0-lab/devmentor/rules/branches/main
```

Po utworzeniu „main” stary „protect main” jest zbędny (jego reguły są podzbiorem nowego). Rulesety się sumują, więc zostawienie go nic nie psuje, ale dla porządku:

```powershell
gh api --method DELETE repos/marczakkrzysztof0-lab/devmentor/rulesets/25068859
```

**Wariant bez drugiego rulesetu** (aktualizacja istniejącego w miejscu, ten sam id, nazwa zmieni się na „main”):

```powershell
gh api --method PUT repos/marczakkrzysztof0-lab/devmentor/rulesets/25068859 --input lekcja-17/ruleset-main.json
```

Wycofanie: `gh api --method DELETE repos/marczakkrzysztof0-lab/devmentor/rulesets/<id nowego>` (albo PUT starej konfiguracji).

## Ryzyka i uwagi do decyzji Krzysztofa

1. **Agenci działają na tym samym koncie GitHub** (`marczakkrzysztof0-lab`, token `gh`). Bypass admina dotyczy więc także agenta: technicznie agent może scalić PR z pominięciem approve i checków. Ruleset tego nie rozróżni — zabezpieczeniem zostaje zasada „agent nie scala, scala Krzysztof” (skille, CLAUDE.md) albo osobne konto/GitHub App dla agentów bez roli admin.
2. **Approve na własnym PR jest niemożliwy** — w praktyce każde scalenie będzie „bypass” przez PR (checkbox „Merge without waiting for requirements to be met”). Ruleset i tak daje wartość: brak bezpośrednich pushy na `main`, brak force push, widoczne czerwone checki i nierozwiązane wątki przed scaleniem.
3. `e2e` i `storybook` trwają ~5–10 min; z `strict_required_status_checks_policy: false` nie trzeba aktualizować gałęzi przed scaleniem (zostawione jak w obecnym rulesecie).
4. `date-guards` dodać do wymaganych po scaleniu PR lekcji 17 (patrz wyżej) — jeśli ruleset ma powstać wcześniej, usuń ten wpis z JSON i dopisz go później PUT-em.
