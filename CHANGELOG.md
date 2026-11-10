# Changelog

Wszystkie istotne zmiany DevMentora. Najnowsze wydanie na górze. Wpisy przygotowuje `om-auto-update-changelog` (okno: PR-y scalone do `main` od poprzedniego taga), akapit Highlights pisze człowiek. Jak przejść między wersjami: [UPGRADE_NOTES.md](UPGRADE_NOTES.md).

# 1.0.0 (2026-11-10)

## Highlights

Pierwsze wydanie z pełnym przepływem pieniędzy: mentor po pierwszym opłaconym zapytaniu zakłada konto wypłat w Stripe Connect Express i dostaje to, co mu się należy, a zwrócone zapytania nigdy nie są wypłacane. Od tej wersji powierzchnie z [BACKWARD_COMPATIBILITY.md](BACKWARD_COMPATIBILITY.md) są kontraktem. Płatności i wypłaty działają tylko w trybie testowym Stripe, dopóki właściciel produktu nie rozstrzygnie Q01, Q02, Q04 i Q05. Aktualizacja z 0.1.0 wymaga jednej migracji (0009) i opcjonalnej zmiennej `STRIPE_CONNECT_WEBHOOK_SECRET`.

## ✨ Features
- ✨ Wypłaty mentorów przez Stripe Connect Express: zachęta po pierwszym opłaconym zapytaniu, strona `/mentor/payouts`, transfery należnych kwot zadaniem `payouts.transferOwed`, wstrzymanie wypłaty po zwrocie lub cofnięciu transferu (fixes #22, #25). (#61) *(@marczakkrzysztof0-lab)*

## 📝 Specs & Documentation
- 📝 Proces wydania: `CHANGELOG.md`, `UPGRADE_NOTES.md` z migracją i wycofaniem, kontrakt kompatybilności wstecznej obowiązujący od 1.0, karta wydania z testem odtworzenia 0.1.0 z taga (fixes #10, #11). *(@marczakkrzysztof0-lab)*

## ⚠️ Znane ograniczenia (świadomie poza 1.0)
- Tylko tryb testowy Stripe (Q01 prowizja, Q02 waluta, Q04 właściciel prawny, Q05 spory).
- #57 link `/r/{token}` działa na okaziciela 30 dni po sesji, bez unieważnienia (do decyzji).
- #58 linki logowania mentora i 30-dniowa sesja bez „wyloguj wszędzie” (do decyzji).
- #59 środowisko QA: 404 z `proxy.ts` daje 500 po 30 s pod `next start -H 127.0.0.1` (tylko QA).
- #53 trzy podatności moderate w `node-pg-migrate` → `glob` → `minimatch` (tylko narzędzie migracji, wzorce plików z repo; poprawka `npm audit fix --force` cofa `node-pg-migrate` do 7.6.1, czyli zmiana łamiąca) i w narzędziach deweloperskich ESLint/Storybook.

## 👥 Contributors

- @marczakkrzysztof0-lab

---

# 0.1.0 (2026-11-06)

## Highlights

Wersja pilotażowa przed wypłatami: strona mentora pod linkiem (E01), opłacone z góry zapytanie z decyzją mentora i automatycznymi zwrotami (E02), czat tekstowy sesji i rozliczenie no-show (E03), design system `@devmentor/ui` i pipeline agentów z bramkami jakości. Tag `v0.1.0` założony wstecznie na commicie 900c844 jako punkt odtworzenia dla 1.0.

## ✨ Features
- ✨ Strona mentora pod linkiem: zaproszenia, linki logowania, edytor strony, dostępność i publiczna strona z cenami i wolnymi terminami (fixes #23, #14, #15, #16). (#35) *(@marczakkrzysztof0-lab)*
- ✨ Płatność kartą w Stripe Checkout i zapytanie opłacone z góry, webhook płatności i operacja zwrotu (E02 część 1, #24, #17). (#40) *(@marczakkrzysztof0-lab)*
- ✨ Decyzja mentora, wygasanie zapytań i anulowanie ze zwrotem do czasu akceptacji (E02 część 2, #18, #19). (#46) *(@marczakkrzysztof0-lab)*
- ✨ Czat tekstowy sesji w zarezerwowanym terminie (fixes #20). (#51) *(@marczakkrzysztof0-lab)*
- ✨ Automatyczne rozliczenie no-show po sesji (fixes #21). (#52) *(@marczakkrzysztof0-lab)*
- ✨ Design system `@devmentor/ui` ze Storybookiem, tokenami i dwoma motywami. (#31) *(@marczakkrzysztof0-lab)*
- ✨ Instalator `npm run setup` (fixes #4). (#5) *(@marczakkrzysztof0-lab)*

## 🔒 Security
- 🔒 Nagłówki bezpieczeństwa (CSP, X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy, bez X-Powered-By), model zagrożeń i próby kontroli dostępu (fixes #55). (#60) *(@marczakkrzysztof0-lab)*
- 🔒 Aktualizacja `next` do 16.4.3 i `nodemailer` do 10.3.1 z powodu podatności (fixes #47). (#50) *(@marczakkrzysztof0-lab)*
- 🔒 Zabezpieczenia narzędzi AI: blokada odczytu `.env*` i kluczy, hook PreToolUse, `CODEOWNERS`, sekrety jako odwołania `op://`. (#36) *(@marczakkrzysztof0-lab)*

## 🐛 Fixes
- 🖼️ Pełny link w polu „Adres strony” zawija się przy 320–375 px zamiast przewijać `/mentor` w poziomie (fixes #42). (#45) *(@marczakkrzysztof0-lab)*
- 🐛 Komunikat „Pytanie zostało właśnie zaakceptowane” nie znika po odświeżeniu przy wyścigu anulowania. (#49) *(@marczakkrzysztof0-lab)*
- 📦 Instalator wykrywa brak Dockera, zakłada pliki env przed bazą, `docker-compose.yml` w repo (fixes #38). (#48) *(@marczakkrzysztof0-lab)*

## 🛠️ Improvements
- 🛠️ Wyłączone `experimental.agentFeedback` w Next.js. (#6) *(@marczakkrzysztof0-lab)*

## 🧪 Testing
- 🧪 Środowisko testowe w Dockerze, skill testów integracyjnych, 9 scenariuszy e2e i job `e2e` w CI. (#43) *(@marczakkrzysztof0-lab)*
- 🧪 Deterministyczna bramka na błędy zależne od daty (job `date-guards`), Stryker i Size Limit (fixes #54). (#56) *(@marczakkrzysztof0-lab)*

## 🚀 CI/CD & Infrastructure
- 🚀 Konfiguracja pipeline'u agentów, skille Open Mercato i etykiety SDLC. (#3) *(@marczakkrzysztof0-lab)*
- 🚀 Nocna zmiana (npm audit/outdated → jedno zgłoszenie) i klasyfikacja backlogu pod pracę równoległą. (#41) *(@marczakkrzysztof0-lab)*

## 📝 Specs & Documentation
- 📝 Product brief, discovery i backlog. (#7) *(@marczakkrzysztof0-lab)*
- 📝 Specyfikacje E01 i E02 po review innym modelem i potwierdzone decyzje (D12). (#29, #30) *(@marczakkrzysztof0-lab)*
- 📝 Prototyp Epiku 01, scenariusz i uwagi z testu z osobą. (#32, #33, #34) *(@marczakkrzysztof0-lab)*

## 👥 Contributors

- @marczakkrzysztof0-lab
