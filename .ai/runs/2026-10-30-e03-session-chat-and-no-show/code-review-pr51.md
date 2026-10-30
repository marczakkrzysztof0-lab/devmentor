# Code review PR #51 (Codex, codex exec -s read-only) — 2026-10-30

**Werdykt: approve**

- **Minor — [SessionChat.tsx:270](packages/ui/src/product/e03/SessionChat.tsx:270).** `maxLength={4000}` w polu tekstowym ogranicza długość według jednostek UTF‑16, a backend liczy punkty kodowe. Scenariusz: wiadomość z 4000 znaków emoji jest poprawna według walidacji serwera, ale pole w przeglądarce pozwoli wpisać tylko około 2000 emoji. Poprawka: zastosować limit liczony w punktach kodowych w kliencie albo ujednolicić definicję długości po stronie UI i serwera.

Rdzeń blokad, kolejność kursora `seq`, izolacja danych, obsługa tokenu i ciasteczka, ochrona CSRF, limity żądań oraz testy odpowiadają sprawdzonym wymaganiom specyfikacji. API tras i użycie `connection()` są zgodne z dokumentacją Next.js 16.

## Odpowiedź

- Minor (maxLength UTF-16): **odrzucone** — DS `Textarea` nie renderuje natywnego `maxlength`; limit liczy w punktach kodowych (`textLength`, `packages/ui/src/components/textarea/Textarea.tsx`), tak jak serwer (`validateMessageBody`). 4000 emoji da się wpisać i wysłać.
