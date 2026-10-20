# Test prototypu z jedną prawdziwą osobą (zadanie domowe L07, krok 5)

Czas: ok. 20–25 minut. Tester: ktoś spoza projektu, najlepiej senior developer (to on byłby mentorem). Nie musi nic instalować — siada przy Twoim komputerze.

## 1. Przygotowanie (Ty, 3 minuty, PowerShell)

Otwórz PowerShell (Start → wpisz „PowerShell” → Enter) i wklej po kolei:

```powershell
cd C:\Users\KMarczak\projekty\devmentor\prototypes\strona-mentora
npm run build
cd C:\Users\KMarczak\projekty\devmentor
npm run storybook
```

Gdy w oknie pojawi się adres `http://localhost:6006`, otwórz w przeglądarce:

`http://localhost:6006/prototypes/strona-mentora/index.html`

Kliknij „Reset symulacji” w pasku „Scenariusze”, żeby zacząć od zera. Okna PowerShell nie zamykaj do końca testu.

## 2. Co powiedzieć testerowi (przeczytaj na głos)

> „To jest prototyp, nie gotowa aplikacja — dane są zmyślone, nic nie zostanie zapisane ani wysłane. Testujemy prototyp, nie Ciebie: jeśli coś jest niejasne, to wina prototypu.
> Wyobraź sobie, że jesteś doświadczonym developerem. Znajomy zaprosił Cię do DevMentora, gdzie developerzy płacą za krótkie konsultacje tekstowe z kimś takim jak Ty. Właśnie otworzyłeś link z zaproszenia.
> Mów na głos, co myślisz i czego się spodziewasz. Ja nie będę podpowiadać.
> Kiedy się zawahasz albo coś Ci się nie spodoba, kliknij »Comment« u góry, kliknij ten element i wpisz jedno zdanie, co pomyślałeś. Potem wróć do »Clickable«.”

## 3. Zadania (podawaj po jednym, bez wskazywania przycisków)

1. „Przyjmij zaproszenie i przygotuj swoją stronę tak, jak zrobiłbyś to naprawdę.” (ceny wpisuje sam — obserwuj, czy się waha; to hipoteza H1)
2. „Ustaw, kiedy możesz przyjmować konsultacje w zwykłym tygodniu.” (hipoteza H2)
3. „Zdobądź link do swojej strony, który wysłałbyś znajomym.”
4. „Zobacz, jak Twoją stronę widzi developer.” (podpowiedź tylko jeśli utknie: wybór ekranu s06 w pasku przeglądu)

Po zadaniach zadaj 2 pytania (o przeszłość, nie o opinię):
- „Kiedy ostatnio ktoś Cię pytał o pomoc w kodzie? Jak to wpasowałeś w dzień?”
- „Co sprawdziłeś albo chciałbyś sprawdzić, zanim wpisałeś ceny?”

Zapisz jego odpowiedzi w punktach (może być na kartce) — wklej je potem jako komentarz w prototypie albo do pliku obok.

## 4. Na koniec (Ty, 1 minuta)

1. W pasku przeglądu kliknij „Threads” → „Export Markdown”. Przeglądarka pobierze `prototype-feedback.md` do folderu Pobrane.
2. Skopiuj go do `C:\Users\KMarczak\projekty\devmentor\lekcja-07\prototype-feedback.md` (w PowerShell):

```powershell
Copy-Item "$env:USERPROFILE\Downloads\prototype-feedback.md" "C:\Users\KMarczak\projekty\devmentor\lekcja-07\prototype-feedback.md"
```

3. Napisz do Claude: „mam feedback od testera”. Agent porówna uwagi z raportem person i wpisze je do specyfikacji (prompt „Decyzje do specyfikacji”), a potem odhaczy ostatni punkt checklisty L07.

W oknie PowerShell zatrzymaj Storybook skrótem Ctrl+C.
