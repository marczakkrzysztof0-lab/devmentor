# Lekcja 16 — SAST (Semgrep CE) i DAST (OWASP ZAP Baseline)

Data: 2026-11-03 · Baza: `main` @ `a4812a3` · Gałąź: `lekcja-16-bezpieczenstwo` · Wykonał: agent (do akceptacji: Krzysztof)

Wszystko lokalnie: Semgrep w kontenerze `semgrep/semgrep` z `--metrics=off` (bez logowania do Semgrep Cloud, kod nie opuszcza komputera; z sieci pobierane są tylko pakiety reguł), ZAP w kontenerze `ghcr.io/zaproxy/zaproxy:stable` przeciw jednorazowemu środowisku z `.ai/scripts/test-env-up.sh` (`next start` na `127.0.0.1`, schemat `dm_migtest_*`, dane syntetyczne). Żadnego celu poza localhost (skrypty odmawiają innego adresu).

## Jak powtórzyć

```sh
sh .ai/qa/lesson-16-sast-dast/semgrep.sh                      # reports/semgrep.json + semgrep-summary.json
sh .ai/scripts/test-env-up.sh                                 # środowisko lokalne
sh .ai/qa/lesson-16-sast-dast/zap-baseline.sh zap-baseline-po # reports/zap-baseline-po.{html,json,md} + -summary.json
sh .ai/scripts/test-env-down.sh
```

Raporty HTML są w `.gitignore` (duże, odtwarzalne); JSON, Markdown i podsumowania są w repo. `evidence/` — wyniki testów czerwony/zielony i kanarka Semgrep.

## Semgrep CE 1.182.1 — pokrycie

| Miara | Wartość |
| --- | --- |
| Pakiety reguł | `p/typescript`, `p/react`, `p/nextjs`, `p/owasp-top-ten`, `p/javascript`, `p/default`, `p/security-audit` |
| Reguły załadowane / uruchomione | 1157 / 236 (pozostałe dotyczą innych języków) |
| Pliki przeskanowane | **206**: `packages/` 111, `lib/` 54, `app/` 32, `scripts/` 8, `proxy.ts` 1 (38 plików `*.stories.tsx` wykluczonych) |
| Błędy parsowania | 1 częściowe (`scripts/check-agents.mjs`, ~99,9% linii sparsowanych) |
| **Pakiet `p/nextjs` osobno** | **pusty dla tego kodu**: „Nothing to scan”, 0 reguł uruchomionych na `app/`, `lib/`, `proxy.ts` — nie daje żadnego pokrycia specyficznego dla Next.js (server actions, route handlers, `proxy.ts`) |
| Kanarek (`evidence/semgrep-canary.txt`) | plik z 3 celowo złymi wzorcami (`dangerouslySetInnerHTML` z propsa, `exec` i `eval` z parametru URL): pełny zestaw złapał **1 z 3** (`eval-detected`, tylko dzięki `p/default`). Pierwszy zestaw (bez `p/default`/`p/security-audit`) — 0 z 3 |

Uwaga do celu „`packages/`”: w DevMentorze `packages/` zawiera tylko design system (`packages/ui`); kod serwera jest w `app/`, `lib/`, `proxy.ts`, więc skan objął też te katalogi. Pierwsza próba z montowaniem całego repo (z `node_modules`) nie skończyła się w 20 min — skrypt skanuje kopię śledzonych plików (`git archive`).

### Znaleziska Semgrep (4) — wszystkie fałszywie dodatnie

| Reguła | Plik:linia | Ocena |
| --- | --- | --- |
| `spawn-shell-true` (ERROR) | `scripts/setup.mjs:165` | wywołania ze stałymi poleceniami (`docker info`, `docker compose …`, `npm …`) — brak danych z zewnątrz; skrypt dewelopera |
| `spawn-shell-true` (ERROR) | `scripts/test-env.mjs:196` | `shell: true` tylko na Windows dla `npm.cmd`, argumenty stałe (komentarz w kodzie) |
| `spawn-shell-true` (ERROR) | `packages/ui/scripts/test-themes.mjs:8` | stałe `npx vitest run`, `shell` tylko na Windows |
| `detect-non-literal-regexp` (WARNING) | `scripts/test-env.mjs:111` | `RegExp` z `Number(port)` — nie da się wstrzyknąć wzorca |

Żadne nie dotyczy kodu, który obsługuje żądania. Brak issue (niepotwierdzone).

## ZAP Baseline 2.17.0 — przed i po poprawce

Skan pasywny bez sesji: pająk 1 min od `/` i od `/m/mentorka-testowa` (seed). Bez ataków aktywnych.

| Alert | Ryzyko | Przed (`a4812a3`) | Po poprawce (`next.config.ts`) |
| --- | --- | --- | --- |
| 10038 CSP Header Not Set | Medium | 8 | **0** |
| 10020 Missing Anti-clickjacking Header | Medium | 4 | **0** |
| 10021 X-Content-Type-Options Missing | Low | 10 | **0** |
| 10037 X-Powered-By leak | Low | 8 | **0** |
| 10063 Permissions Policy Not Set | Low | 10 | **0** |
| 10055 CSP: script-src unsafe-inline | Medium | — | 13 (nowy: świadomy kompromis, do akceptacji — `docs/security/plan-poprawek.md`) |
| 90004 Cross-Origin-Embedder-Policy Missing | Low | 16 | 15 (zaakceptowane: aplikacja nie potrzebuje izolacji cross-origin) |
| 10031 User Controllable HTML Attribute | Info | 1 | 1 (fałszywe: wartość `25` przycisku długości sesji jest stała, pokrywa się z parametrem pająka) |
| 10049 Non-Storable Content, 10109 Modern Web Application | Info | 19 / 6 | 19 / 6 (informacyjne) |

FAIL: 0 w obu przebiegach (baseline z `-I`). Raporty: `reports/zap-baseline-przed.*`, `reports/zap-baseline-po.*`.

Potwierdzone znalezisko → issue **#55** (nagłówki bezpieczeństwa), poprawka w tym PR + testy:
- `tests/security/security-headers.test.mjs` — czerwony 4/4 na `a4812a3` (`evidence/headers-unit-red.txt`), zielony 4/4 po poprawce (`evidence/headers-unit-green.txt`);
- `tests/e2e/security-headers.e2e.mjs` — zielony 4/4 na buildzie z poprawką (`evidence/headers-e2e-green.txt`; na `a4812a3` czerwony z definicji — ZAP „przed” pokazuje brak tych samych nagłówków).

Obserwacja przy okazji → issue **#59**: na środowisku QA (`next start -H 127.0.0.1`) strony 404 z rewrite w `proxy.ts` (`/r/{zły token}`, `/m/{nieznany slug}`) dają 500 po 30 s („Failed to proxy … socket hang up”); pod runnerem e2e działają poprawnie. Dla ZAP oznacza to, że te ścieżki nie zostały rzetelnie zbadane.

## Czego skany nie sprawdziły

- **Kontrola dostępu i izolacja danych** (IDOR między mentorami, role deweloper/mentor) — ani Semgrep (brak reguł rozumiejących `getCurrentMentor()` + filtr `mentor_id` w SQL), ani ZAP bez sesji. Sprawdzone osobno próbami HTTP dwoma kontami: `docs/security/kontrola-dostepu.md` (G1–G3: PASS).
- **Logika biznesowa**: linki na okaziciela `/r/{token}` (30 dni, anulowanie ze zwrotem — issue #57), linki logowania i 30-dniowa sesja mentora (issue #58), wyścigi decyzja/anulowanie, rozliczenie no-show, idempotencja webhooka Stripe — tylko przegląd i testy jednostkowe/DB repo.
- **Server actions i route handlers z sesją**: ZAP bez logowania nie dotarł do `/mentor/*` ani API czatu; brak skanu uwierzytelnionego (wymagałby skryptu logowania linkiem w ZAP — do decyzji).
- **Aktywne ataki** (ZAP Full Scan/Active Scan), testy obciążeniowe, limit częstości — poza zakresem zgody.
- **Zależności i łańcuch dostaw** — `npm audit`/Dependabot (nocna zmiana, issue #53), nie Semgrep CE.
- **Specyfika Next.js** — pakiet `p/nextjs` nic nie uruchomił; kanarek pokazał, że reguły społeczności słabo łapią TSX (1 z 3).
