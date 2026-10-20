// Pasek przeglądu: oznaczenie „Prototyp”, wybór ekranu, motyw i kontrolki scenariuszy (C1–C16).
// To nie jest część produktu: osobno od nawigacji produktu (zasada 5).
import { useEffect, useState, type ReactNode } from "react";

import { INVITE_EXPIRES, SIGN_IN_EXPIRES } from "./data";
import { useCurrentScreen } from "./Screen";
import { publicRoute } from "./screens/S06S07Public";
import { availabilityPresetOf, goTo, useSim, type Sim, type Theme } from "./store";

export const SCREENS = [
  { id: "s01", label: "s01 Zaproszenie" },
  { id: "s02", label: "s02 Logowanie" },
  { id: "s03", label: "s03 Brak dostępu" },
  { id: "s04", label: "s04 Edytor" },
  { id: "s05", label: "s05 Dostępność" },
  { id: "s06", label: "s06 Strona publiczna" },
  { id: "s07", label: "s07 Nie ma strony" },
];

function Control<T extends string>({ id, label, value, options, onChange }: { id: string; label: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="sim-control">
      <label htmlFor={`ctl-${id}`}>
        <span className="sim-code">{id}</span> {label}
      </label>
      <select id={`ctl-${id}`} data-control={id} value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map(([v, text]) => (
          <option key={v} value={v}>
            {text}
          </option>
        ))}
      </select>
    </div>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="sim-group">
      <legend>{title}</legend>
      {children}
    </fieldset>
  );
}

const THEME_LABEL: Record<Theme, string> = { system: "Motyw: systemowy", light: "Motyw: jasny", dark: "Motyw: ciemny" };
const NEXT_THEME: Record<Theme, Theme> = { system: "light", light: "dark", dark: "system" };

function routeFor(screen: string, sim: Sim) {
  switch (screen) {
    case "s01":
      return "/invite/…";
    case "s02":
      return "/sign-in/…";
    case "s03":
    case "s04":
      return "/mentor";
    case "s05":
      return "/mentor/availability";
    default:
      return publicRoute(sim);
  }
}

export function ReviewBar() {
  const store = useSim();
  const { sim, set, setRole, setSession, setPageState, setAvailabilityPreset, reset } = store;
  const screen = useCurrentScreen();
  const [message, setMessage] = useState("");
  const [cli, setCli] = useState<string | null>(null);

  useEffect(() => {
    const onAnnounce = (event: Event) => setMessage(String((event as CustomEvent).detail));
    document.addEventListener("prototype:announce", onAnnounce);
    return () => document.removeEventListener("prototype:announce", onAnnounce);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (sim.theme === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", sim.theme);
    const dark = sim.theme === "dark" || (sim.theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    root.classList.toggle("dark", dark); // mostek.css silnika używa klasy .dark
  }, [sim.theme]);

  const preset = availabilityPresetOf(sim.windows);

  return (
    <div className="review">
      <div className="doc-toolbar">
        <span className="proto-badge">Prototyp</span>
        <nav className="screen-nav" aria-label="Ekrany prototypu">
          {SCREENS.map((s) => (
            <a key={s.id} href={`#${s.id}`} aria-current={screen === s.id ? "true" : undefined}>
              {s.label}
            </a>
          ))}
        </nav>
        <button id="theme-toggle" type="button" className="btn btn-outline btn-sm" onClick={() => set({ theme: NEXT_THEME[sim.theme] })}>
          {THEME_LABEL[sim.theme]}
        </button>
      </div>
      <div className="review-status">
        <span>
          Adres (symulacja): <code data-testid="route">{routeFor(screen, sim)}</code>
        </span>
        <span>Teraz (zegar demo): {sim.plusDay ? "wt 20.10.2026, 19:00" : "pn 19.10.2026, 19:00"} Europe/Warsaw</span>
        <span role="status" aria-live="polite" className="review-message">
          {message}
        </span>
      </div>
      <details className="sim-panel">
        <summary>Scenariusze (kontrolki prototypu, nie funkcje produktu)</summary>
        <div className="sim-groups">
          <Group title="Kto i sesja">
            <Control id="C1" label="Rola / widok" value={sim.role} onChange={setRole} options={[["anna", "Mentorka Anna (z sesją)"], ["anna-bez-sesji", "Mentorka Anna (bez sesji)"], ["kuba", "Developer Kuba (anonim)"], ["oliwia", "Founder Oliwia (CLI)"]]} />
            <Control id="C5" label="Sesja" value={sim.session} onChange={setSession} options={[["aktywna", "aktywna"], ["brak", "brak"], ["wygasla", "wygasła przy wejściu"], ["wygasa-przy-zapisie", "wygasa przy najbliższym zapisie (L6)"], ["inny-mentor", "zalogowany inny mentor (L5)"]]} />
          </Group>
          <Group title="Linki (s01, s02)">
            <Control id="C2" label="Link zaproszenia" value={sim.inviteLink} onChange={(v) => set({ inviteLink: v })} options={[["valid", "ważny"], ["expired", "wygasł"], ["revoked", "odwołany"], ["used", "już użyty"], ["unknown", "nieznany token"], ["has-account", "email ma już konto (L4)"]]} />
            <Control id="C3" label="Wynik kliknięcia w linku" value={sim.linkResult} onChange={(v) => set({ linkResult: v })} options={[["ok", "sukces"], ["pending", "długo trwa"], ["network", "brak sieci"]]} />
            <Control id="C4" label="Link logowania" value={sim.signInLink} onChange={(v) => set({ signInLink: v })} options={[["valid", "ważny"], ["used", "użyty"], ["expired", "wygasł (po 72 h)"], ["unknown", "nieznany"], ["double", "podwójne kliknięcie (druga karta)"]]} />
          </Group>
          <Group title="Strona i dostępność (s04, s05)">
            <Control id="C6" label="Stan strony Anny" value={sim.pageState} onChange={setPageState} options={[["empty", "pusty szkic (pierwsza wizyta)"], ["draft", "szkic wypełniony"], ["published", "opublikowana"], ["published-no-availability", "opublikowana bez dostępności"]]} />
            <Control id="C7" label="Wynik zapisu / publikacji" value={sim.saveResult} onChange={(v) => set({ saveResult: v })} options={[["ok", "ok"], ["slug-taken", "adres zajęty"], ["field-error", "błąd pola z serwera"], ["server", "błąd serwera"], ["network", "brak sieci"], ["slow", "długo trwa"]]} />
            <Control id="C8" label="Dostępność Anny" value={preset === "custom" ? ("custom" as never) : preset} onChange={setAvailabilityPreset} options={[["none", "brak okien"], ["set", "wt 18–20 + czw 12–13"], ["short-notice", "okno dziś w ciągu 3 h"], ...(preset === "custom" ? ([["custom", "własne (zapisane w s05)"]] as [never, string][]) : [])]} />
            <Control id="C9" label="Wynik zapisu dostępności" value={sim.availabilityResult} onChange={(v) => set({ availabilityResult: v })} options={[["ok", "ok"], ["server", "błąd serwera"], ["network", "brak sieci"], ["slow", "długo trwa"], ["too-many", "22 okna na ekranie (limit 21)"]]} />
            <Control id="C16" label="Wczytywanie s04, s05" value={sim.loading} onChange={(v) => set({ loading: v })} options={[["short", "krótko (0,5 s)"], ["stuck", "zatrzymane (stan Ł)"]]} />
          </Group>
          <Group title="Strona publiczna (s06, s07)">
            <Control id="C10" label="Strefa przeglądarki" value={sim.zone} onChange={(v) => set({ zone: v })} options={[["warsaw", "Europe/Warsaw"], ["london", "Europe/London"], ["none", "niedostępna lub błędna"]]} />
            <Control id="C11" label="Sekcja terminów" value={sim.slotsSection} onChange={(v) => set({ slotsSection: v })} options={[["ready", "gotowe"], ["loading", "ładowanie"], ["error", "błąd"], ["offline", "brak sieci"]]} />
            <Control
              id="C12"
              label="Adres publiczny"
              value={sim.publicPath}
              onChange={(v) => {
                set({ publicPath: v });
                goTo(v === "anna" || v === "piotr-n" ? "s06" : "s07");
              }}
              options={[["anna", `/m/${sim.pageValues.slug} (Anna)`], ["piotr-n", "/m/piotr-n (bez dostępności)"], ["ewa-szkic", "/m/ewa-szkic (szkic)"], ["annak2", "/m/annak2 (literówka)"], ["m", "/m"], ["m-search", "/m?search=react"]]}
            />
            <Control id="C13" label="Opis" value={sim.longDescription ? "long" : "short"} onChange={(v) => set({ longDescription: v === "long" })} options={[["short", "3 zdania"], ["long", "2000 znaków"]]} />
          </Group>
          <Group title="Zegar i szerokość">
            <Control id="C14" label="Zegar demo" value={sim.plusDay ? "plus" : "now"} onChange={(v) => set({ plusDay: v === "plus" })} options={[["now", "stały „teraz”"], ["plus", "+1 dzień"]]} />
            <Control id="C15" label="Szerokość ramki" value={sim.width} onChange={(v) => set({ width: v })} options={[["full", "pełna"], ["1024", "1024 px"], ["375", "375 px"], ["320", "320 px"]]} />
          </Group>
          <Group title="Founder Oliwia (symulowany CLI, L11)">
            <div className="sim-actions">
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => {
                  set({ inviteLink: "valid" });
                  setCli(`$ npm run mentor:invite -- anna@example.com\nhttp://localhost:3000/invite/demo-valid (ważny do ${INVITE_EXPIRES})`);
                }}
              >
                Wygeneruj zaproszenie
              </button>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => {
                  set({ signInLink: "valid" });
                  setCli(`$ npm run mentor:sign-in-link -- anna@example.com\nhttp://localhost:3000/sign-in/demo-valid (ważny do ${SIGN_IN_EXPIRES})`);
                }}
              >
                Wygeneruj link logowania
              </button>
            </div>
            {cli ? (
              <>
                <pre className="sim-cli" data-testid="cli">
                  {cli}
                </pre>
                <button type="button" className="btn btn-outline btn-sm" onClick={() => goTo(cli.includes("/invite/") ? "s01" : "s02")}>
                  Otwórz link jako Anna
                </button>
              </>
            ) : (
              <p className="sim-hint">Bez ekranu w produkcie: founder działa tylko przez CLI (#14 Q5). Prototyp nie wysyła maili.</p>
            )}
          </Group>
        </div>
        <div className="sim-actions">
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={() => {
              reset();
              setCli(null);
              setMessage("Symulacja zresetowana do początku.");
              goTo("s01");
            }}
          >
            Reset symulacji
          </button>
        </div>
      </details>
    </div>
  );
}
