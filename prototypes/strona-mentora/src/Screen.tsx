// Ramka ekranu według umowy silnika przeglądu: section.screen > .screen-meta + .frame + .notes.
import { useEffect, useState, type ReactNode } from "react";
import { Alert, TextLink, cn } from "@devmentor/ui";

import { goTo, useSim } from "./store";

export function Screen({ id, title, route, notes, children }: { id: string; title: string; route: string; notes: ReactNode; children: ReactNode }) {
  const { sim } = useSim();
  return (
    <section className="screen" id={id} aria-label={`${id} · ${title}`}>
      <div className="screen-meta">
        <h2>
          {id} · {title}
        </h2>
        <p>
          Adres w aplikacji: <code>{route}</code>
        </p>
      </div>
      <div className="frame" data-width={sim.width}>
        {children}
      </div>
      <div className="notes">
        <div className="note">{notes}</div>
      </div>
    </section>
  );
}

/** Wyraźnie podpisana symulacja na ekranie (zasada 4): to nie jest część produktu. */
export function SimNote({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="sim-note" data-sim="true">
      <Alert tone="info" title="Symulacja prototypu" action={action}>
        {children}
      </Alert>
    </div>
  );
}

/** Przycisk-link w notatce symulacji, który przenosi do ekranu przez silnik. */
export function SimGoto({ screen, children }: { screen: string; children: ReactNode }) {
  return (
    <TextLink href={`#${screen}`} onClick={(e) => (e.preventDefault(), goTo(screen))}>
      {children}
    </TextLink>
  );
}

/** Aktualny ekran (zdarzenie silnika `prototype:screen-change`). */
export function useCurrentScreen() {
  const [screen, setScreen] = useState<string>("");
  useEffect(() => {
    const onChange = (event: Event) => setScreen(String((event as CustomEvent).detail));
    document.addEventListener("prototype:screen-change", onChange);
    return () => document.removeEventListener("prototype:screen-change", onChange);
  }, []);
  return screen;
}

/**
 * Wczytywanie przy wejściu na ekran (stan Ł): krótko (0,5 s) albo „zatrzymane” (C16).
 * `loading` jest true, dopóki ekran się „wczytuje”; `arrival` liczy wejścia na ekran.
 */
export function useArrivalLoading(screenId: string) {
  const { sim } = useSim();
  const [arriving, setArriving] = useState(false);
  const [arrival, setArrival] = useState(0);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onChange = (event: Event) => {
      if ((event as CustomEvent).detail !== screenId) return;
      setArriving(true);
      setArrival((n) => n + 1);
      clearTimeout(timer);
      timer = setTimeout(() => {
        setArriving(false);
        // Po wczytaniu fokus na nagłówku ekranu (silnik ustawia go przy wejściu, ale wtedy jest jeszcze szkielet).
        setTimeout(() => {
          const heading = document.querySelector<HTMLElement>(`#${screenId} .frame h1`);
          const active = document.activeElement;
          if (heading && (!active || active === document.body || !document.getElementById(screenId)?.contains(active))) {
            heading.setAttribute("tabindex", "-1");
            heading.focus({ preventScroll: true });
          }
        }, 50);
      }, 500);
    };
    document.addEventListener("prototype:screen-change", onChange);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("prototype:screen-change", onChange);
    };
  }, [screenId]);
  return { loading: sim.loading === "stuck" || arriving, arrival };
}

/**
 * Nawigacja mentora w E01: tylko „Strona” i „Dostępność” (L10) oraz „Wyloguj” (L7).
 * LUKA DS D2: MentorNav ma stałą pozycję „Zapytania” (E02) i nie da się jej ukryć.
 * LUKA DS D3: w DS nie ma kontrolki „Wyloguj”.
 * Złożone z tych samych klas tokenów co MentorNav (bez nowych wartości).
 */
export function MentorNavE01({ current, onSignOut }: { current: "page" | "availability"; onSignOut: () => void }) {
  const items = [
    { key: "page", label: "Strona", screen: "s04" },
    { key: "availability", label: "Dostępność", screen: "s05" },
  ] as const;
  const link = "inline-flex rounded-control px-in-group py-inline text-primary underline-offset-4 hover:underline outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus-ring";
  return (
    <header className="flex flex-wrap items-center justify-between gap-in-group border-b border-divider px-page-gutter py-in-group">
      <span className="font-strong">DevMentor</span>
      <nav aria-label="Panel mentora">
        <ul className="flex flex-wrap gap-in-group">
          {items.map((item) => (
            <li key={item.key}>
              <a href={`#${item.screen}`} aria-current={item.key === current ? "page" : undefined} className={cn(link, item.key === current && "font-strong underline decoration-2")}>
                {item.label}
              </a>
            </li>
          ))}
          <li>
            <button type="button" onClick={onSignOut} className={cn(link, "cursor-pointer")}>
              Wyloguj
            </button>
          </li>
        </ul>
      </nav>
    </header>
  );
}
