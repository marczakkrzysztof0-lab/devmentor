# Scenariusze testów integracyjnych (.ai/qa)

Katalog zawiera scenariusze Given–When–Then po polsku, po jednym pliku na test integracyjny, pogrupowane w obszary: `AUTH`, `MENTOR-PAGE`, `PUBLIC-PAGE` (oraz `AVAILABILITY`, gdy pojawią się scenariusze). Nazwa pliku: `{AREA}-{number}-{slug}.md`. Każdy scenariusz linkuje do testu, który go realizuje, a test w pierwszym komentarzu wskazuje swój scenariusz. Zasady: `.ai/skills/om-integration-tests/`.

## Uruchamianie

1. `npm run build`
2. `npm run test:integration` — wszystkie testy; jeden plik: `npm run test:integration -- tests/e2e/<plik>`

Wymagany jest Postgres z `DATABASE_URL`; `scripts/test-e2e.mjs` tworzy i usuwa jednorazowy schemat `dm_migtest_*` i startuje aplikację na wolnym porcie.

## Indeks scenariuszy

| Id | Tytuł | Niestandardowy | Test |
|---|---|---|---|
| [AUTH-001](AUTH/AUTH-001-rownolegla-akceptacja-tego-samego-zaproszenia.md) | Jedno konto i jedna sesja, gdy dwie przeglądarki jednocześnie akceptują to samo zaproszenie | tak | [auth-001-rownolegla-akceptacja-zaproszenia.e2e.mjs](../../tests/e2e/auth-001-rownolegla-akceptacja-zaproszenia.e2e.mjs) |
| [AUTH-002](AUTH/AUTH-002-ponowne-uzycie-linku-logowania-w-innej-karcie.md) | Link logowania zużywany raz — druga karta wchodzi bez nowej sesji, inna przeglądarka widzi nieaktywny link | tak | [auth-002-link-logowania-w-drugiej-karcie.e2e.mjs](../../tests/e2e/auth-002-link-logowania-w-drugiej-karcie.e2e.mjs) |
| [AUTH-003](AUTH/AUTH-003-wygasly-link-logowania.md) | Komunikat „Ten link jest nieaktywny…” bez przycisku, gdy link logowania wygasł | nie | [auth-003-wygasly-link-logowania.e2e.mjs](../../tests/e2e/auth-003-wygasly-link-logowania.e2e.mjs) |
| [AUTH-004](AUTH/AUTH-004-wylogowanie-w-innej-karcie.md) | Odebranie dostępu drugiej karcie po „Wyloguj” w pierwszej | nie | [auth-004-wylogowanie-w-innej-karcie.e2e.mjs](../../tests/e2e/auth-004-wylogowanie-w-innej-karcie.e2e.mjs) |
| [MENTOR-PAGE-001](MENTOR-PAGE/MENTOR-PAGE-001-publikacja-bez-ceny-za-50-min.md) | Odmowa publikacji strony, gdy brak ceny za 50 min | nie | [mentor-page-001-publikacja-bez-ceny.e2e.mjs](../../tests/e2e/mentor-page-001-publikacja-bez-ceny.e2e.mjs) |
| [MENTOR-PAGE-002](MENTOR-PAGE/MENTOR-PAGE-002-granice-cen-20-i-5000-zl.md) | Odrzucenie cen 19 i 5001 zł oraz publikacja z cenami 20 i 5000 zł | nie | [mentor-page-002-granice-cen.e2e.mjs](../../tests/e2e/mentor-page-002-granice-cen.e2e.mjs) |
| [MENTOR-PAGE-003](MENTOR-PAGE/MENTOR-PAGE-003-kolizja-sluga-przy-publikacji.md) | Odmowa publikacji pod adresem zajętym przez inną mentorkę | tak | [mentor-page-003-kolizja-sluga.e2e.mjs](../../tests/e2e/mentor-page-003-kolizja-sluga.e2e.mjs) |
| [MENTOR-PAGE-004](MENTOR-PAGE/MENTOR-PAGE-004-slug-z-polskimi-znakami.md) | Adres bez polskich znaków z imienia „Łukasz Żółć-Ślęzak” i publikacja | tak | [mentor-page-004-slug-z-polskimi-znakami.e2e.mjs](../../tests/e2e/mentor-page-004-slug-z-polskimi-znakami.e2e.mjs) |
| [PUBLIC-PAGE-001](PUBLIC-PAGE/PUBLIC-PAGE-001-okno-z-panelu-widoczne-na-stronie-publicznej.md) | Terminy z okna z panelu widoczne dla dewelopera w jego strefie, pusty stan po usunięciu okna | nie | [public-page-001-okno-z-panelu-na-stronie-publicznej.e2e.mjs](../../tests/e2e/public-page-001-okno-z-panelu-na-stronie-publicznej.e2e.mjs) |

## Stan roboczy środowiska QA

`test-env.json`, `test-env.env` i `artifacts/` to lokalny stan roboczy `om-prepare-test-env` — są w `.gitignore` i nie trafiają do repozytorium.
