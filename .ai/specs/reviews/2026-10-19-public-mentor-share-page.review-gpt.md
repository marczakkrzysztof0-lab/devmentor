# Architectural Review: Public mentor share page

**Werdykt: revise.** Kierunek jest zgodny z briefem i zależnymi specyfikacjami, a historie opisują decyzje użytkownika, nie tylko operacje CRUD. Przed implementacją trzeba jednak doprecyzować bezpieczeństwo publicznych pól i zachowanie przy braku obsługi slotów w pierwszej fazie.

## Findings

- **High: Publiczny DTO może ujawniać dane draftu przez założenie o granicy tabel.** Spec każe pobierać opublikowaną stronę z `mentor_pages`, ale równocześnie umieszcza `displayName`, `publicWorkUrl` i `description` w DTO, nie określając, skąd pochodzą ani jak query wiąże je z `mentors`. #23 rozdziela prywatny e-mail od publicznej strony, a #14 opisuje pola publikacji i ceny w `mentor_pages`. Jeśli implementacja dołączy dane mentora lub pobierze stronę bez warunku `published_at`, może ujawnić dane draftu. **Korekta:** wskazać `mentor_pages` jako źródło wszystkich publicznych pól i wymagać warunku `published_at IS NOT NULL` w tym samym query, które buduje DTO; osobno ograniczyć slot query do tego samego opublikowanego mentora.

- **High: `noindex, nofollow` nie gwarantuje wymogu „nie jest wymieniana w żadnym wyszukiwaniu”.** R14 i D03 zakazują katalogu oraz wyszukiwania, natomiast `noindex` jest wskazówką dla crawlerów, a `nofollow` nie ukrywa URL-a. Samo dodanie meta robots nie zabezpiecza przed pojawieniem się adresu w wynikach. **Korekta:** opisać to jako best-effort dla crawlerów, jeśli wystarcza produktowo; jeśli wymóg oznacza brak publicznego indeksowania, wskazać mechanizm i granicę jego gwarancji. Nie przedstawiać tej decyzji jako równoważnej z brakiem katalogu.

- **Medium: Historie obiecują sloty, ale pierwsza faza strony ich nie zawiera.** Historia 1 opisuje dostępne terminy jako część decyzji dewelopera, a briefowy przepływ również wymaga slotów. Phasing dopuszcza wdrożenie strony po #14 bez sekcji slotów, przed #15, i określa je jako „shippable”. **Korekta:** zaznaczyć, że faza 1 nie realizuje pełnego przepływu z historii 1 i nie może być powierzchnią używaną przez pilot; albo przenieść tę historię do fazy 2.

- **Medium: Fallback strefy czasowej nie definiuje obsługi nieprawidłowej strefy.** Spec przewiduje UTC dla „unknown browser zone”, ale `Intl.DateTimeFormat` może zgłosić wyjątek dla nieobsługiwanej wartości, a nieznana strefa nie musi być tym samym co strefa UTC. To może zepsuć renderowanie slotów dla pojedynczego użytkownika. **Korekta:** określić walidację strefy przed formatowaniem i jawny fallback do UTC z etykietą „UTC”, również gdy konstruktor formattera zawiedzie.

- **Low: Testy katalogu przypisują tej stronie odpowiedzialność za niepowiązane trasy.** Krok 3 wymaga testowania `/m`, `/m?search=react`, `/mentors` i treści `/`, choć spec dodaje tylko `/m/[slug]`. To rozmywa zakres i może wymuszać testy istniejących zachowań niezwiązanych z nową trasą. **Korekta:** testować brak katalogu jako brak nowych tras/listingu i sprawdzić, że strona `/m/[slug]` nie renderuje wyników wyszukiwania; pozostałe ścieżki testować tylko, jeśli zmieniają się w ramach tej funkcji.

## Review limits

Sprawdzono specyfikację, skill review, `AGENTS.md`, `SDLC.md`, `BACKWARD_COMPATIBILITY.md`, brief produktowy, specyfikacje #14, #15 i #23 oraz istniejący kod aplikacji. Repozytorium jest na etapie szkieletu, więc ocena opiera się głównie na kontraktach zapisanych w specyfikacjach; nie weryfikowano implementacji ani działania Next.js.