# Silnik przeglądu prototypu

Pochodzi z prototypu DevMentora (materiały lekcji 07 kursu AI Tech Leaders). Dodaje do każdego klikalnego prototypu:

- tryb klikania i tryb komentarzy (w trybie komentarzy kliknięcie przypina komentarz do elementu, zamiast go uruchamiać),
- hotspoty, tryb prezentacji (jeden ekran naraz), mapę ekranów i przycisk „← Back”,
- wątki komentarzy z odpowiedziami, rozwiązaniem i usuwaniem,
- eksport: „Export for repository” (nowy `comments.js` do commita) i „Export Markdown” (`prototype-feedback.md`, pogrupowany według ekranów).

Działa z czystym HTML-em i z Reactem. Nie potrzebuje serwera ani bazy: komentarze zapisuje w przeglądarce, a do zespołu trafiają przez commit `comments.js`.

## Pliki

- `prototype.js`: silnik. Nie edytuj.
- `comments.js`: zatwierdzone komentarze. Na start pusty; w `prototypeId` wpisz nazwę prototypu.
- `prototype.css`: wygląd paska przeglądu i komentarzy.
- `mostek.css`: podpina nazwy używane przez silnik pod tokeny Twojego design systemu. Dopasuj go.

## Umowa z markupem

- `<html data-prototype-id="nazwa" data-start-screen="s01">`
- pasek przeglądu: element z klasą `doc-toolbar`, w nim nawigacja `.screen-nav` z linkami `<a href="#s01">Nazwa ekranu</a>`,
- każdy ekran: `<section class="screen" id="s01">` z opisem w `.screen-meta` i treścią w `.frame`; opcjonalnie notatka w `.notes > .note`,
- przejście do ekranu: link z `href="#s02"`, element z `data-goto="s02"` albo zdarzenie `document.dispatchEvent(new CustomEvent('prototype:navigate', { detail: 's02' }))`,
- identyfikatory ekranów się nie zmieniają, bo to do nich przypięte są komentarze.

## Podłączenie w Reakcie

1. Zaimportuj w pliku startowym: `import './comments.js'; import './prototype.js';` i style: `prototype.css`, `mostek.css`.
2. Wyrenderuj pasek `.doc-toolbar` i wszystkie ekrany `section.screen`.
3. Po pierwszym renderze wywołaj `window.__PROTOTYPE_START__()`.

## Jak zbierać komentarze

1. Recenzent włącza „Comment”, klika element i pisze uwagę. Komentarz zapisuje się tylko w jego przeglądarce.
2. Na koniec wybiera „Export for repository”, podmienia `comments.js` w repozytorium i robi commit. Albo „Export Markdown” i wkleja uwagi do zadania.
3. Współpracy na żywo nie ma: każdy recenzent eksportuje swoje komentarze, a log operacji łączy się bez gubienia usuniętych wątków.
