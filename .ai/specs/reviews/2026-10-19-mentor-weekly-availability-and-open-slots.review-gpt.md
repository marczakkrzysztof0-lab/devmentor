# Architectural Review: Mentor weekly availability and open slots

**Werdykt: revise.** Spec dobrze oddziela tygodniową dostępność od próśb o sesję i słusznie wymaga ponownej walidacji slotu przy zapisie. Przed implementacją trzeba jednak rozstrzygnąć sprzeczność z celem produktu oraz doprecyzować granice slotu i zachowanie przy zmianie strefy.

## Decision needed

- **Czy 3-godzinne minimum wyprzedzenia jest zgodne z A01?** Product brief mówi, że deweloperzy szukają pomocy „within the hour, within twenty minutes, or the same day”; spec usuwa sloty zaczynające się w ciągu 3 godzin. Zalecenie: potwierdzić tę regułę z właścicielem produktu i zaktualizować brief albo przyjąć krótsze minimum na pilota. To decyzja produktowa, nie wada implementacyjna.

## Findings

- **High: generowanie slotów nie określa, czy siatka :00/:30 jest lokalna czy UTC.** Spec mówi o tygodniowych oknach w czasie mentora, slotach zaczynających się na `:00` i `:30` oraz konwersji lokalnych ściennych godzin na UTC. Nie określa jednak jawnie, w której strefie stosuje siatkę. Wokół DST wybór zmienia dostępne terminy i ich zgodność z oknami → implementacja może nie zgadzać się z podglądem ani walidacją E02. **Korekta:** określić siatkę jako lokalną w strefie mentora i opisać, jak wyznaczać kandydatów podczas przejścia DST.

- **High: kontrakt dopuszcza okna, z których nie da się utworzyć żadnego slotu 25-minutowego.** Walidacja wymaga jedynie końca późniejszego niż początek, a przypadek 30-minutowego okna oferuje slot 25-minutowy. Przy oknie 15-minutowym system zapisze dostępność, ale nie pokaże żadnego terminu; ten stan nie jest opisany w edytorze. → mentor może uznać, że dostępność została opublikowana, choć nic nie można zarezerwować. **Korekta:** odrzucać okna krótsze niż 25 minut albo jasno pokazywać, że okno nie generuje slotów.

- **High: obietnica „dokładnie tych slotów” nie określa rozstrzygania jednoczesnych zapisów.** `isSlotOffered` weryfikuje slot, lecz spec nie mówi, czy walidacja i utworzenie prośby E02 są atomowe wobec innej prośby o ten sam czas. Sprawdzenie przed zapisem może przepuścić dwa równoczesne żądania → konflikt slotu mimo poprawnej walidacji. **Korekta:** wskazać, że E02 serializuje sprawdzenie i zajęcie slotu lub egzekwuje brak nakładania się rezerwacji w transakcji.

- **Medium: zmiana strefy czasowej zmienia sens zapisanej dostępności bez osobnego potwierdzenia.** Spec stanowi, że okna zachowują godzinę ścienną w nowej strefie; zdanie „preview shows the result before the mentor leaves” nie opisuje jednak, czy podgląd jest wymagany przed zapisem. → przypadkowa zmiana strefy może przesunąć wszystkie przyszłe terminy dla odbiorców. **Korekta:** pokaż różnicę w podglądzie przed zatwierdzeniem zmiany strefy i wymagać jawnego zapisu.

- **Medium: fazowanie nie dostarcza działającej fazy 1.** Slot engine w fazie 1 zwraca `[]`, dopóki mentor nie zapisze okien, a edytor pojawia się dopiero w fazie 2. W praktyce faza 1 nie ma użytecznej ścieżki dla użytkownika ani konsumenta #16. **Korekta:** połączyć engine i edytor w jedną wdrażalną fazę albo opisać działającą integrację/harness uzasadniającą osobne wdrożenie.

- **Medium: zakres specyfikacji wykracza poza pojedynczą zdolność.** Silnik slotów i interfejs edycji mogą być wdrażane niezależnie; spec ma osobne fazy, a sam engine ma działać bez UI, gdy #16 zintegruje go jako konsumenta. To narusza heurystykę jednej niezależnie wdrażalnej zdolności na spec → niejasna odpowiedzialność za kontrakt między #15 a #16. **Korekta:** rozważyć wydzielenie kontraktu/slot engine do osobnej specyfikacji albo uzasadnić, dlaczego oba elementy wymagają wspólnego wdrożenia.

- **Low: spec ustala szczegóły implementacji i testów bardziej szczegółowo niż wymaga tego kontrakt.** Przykłady: nazwy helperów, `Intl.DateTimeFormat`, pojedyncza transakcja delete+insert, dokładny limit 21 okien i lista przypadków testowych w planie. Część tych decyzji nie wynika z architektury istniejącego kodu, którego jeszcze nie ma → zwiększa koszt zmian bez dodatkowej wartości dla implementującego. **Korekta:** zachować wymagania zewnętrzne (bezpieczne konwersje DST, zapis atomowy, limit payloadu), a wybór helpera i układ testów zostawić implementacji.

## Review limits

Sprawdzono spec, instrukcje repozytorium, SDLC, zasady kompatybilności, `package.json`, brief produktu, dostępny spec #14 oraz istniejący kod aplikacji. Nie znaleziono wskazanego specyfikacją pliku dla #17, więc walidację E02 i wzajemną spójność z tym dokumentem oceniono na podstawie odwołań w #15. Kod aplikacji jest szkieletem; przegląd nie weryfikuje implementacji ani zachowania Next.js.