// Stan symulacji prototypu: kontrolki scenariuszy (C1–C16 z mapy ekranów) i dane, które
// zmieniają akcje produktu (publikacja, zapis dostępności, logowanie). Tylko w pamięci:
// przeładowanie strony albo „Reset symulacji” wraca do początku.
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { AvailabilityWindow, MentorPageValues } from "@devmentor/ui/product";

import { ANNA_VALUES, ANNA_WINDOWS, DAY_MS, DEFAULT_ZONE, EMPTY_VALUES, NOW_ISO, SHORT_NOTICE_WINDOWS } from "./data";

export type Role = "anna" | "anna-bez-sesji" | "kuba" | "oliwia"; // C1
export type Session = "aktywna" | "brak" | "wygasla" | "wygasa-przy-zapisie" | "inny-mentor"; // C5
export type InviteLink = "valid" | "expired" | "revoked" | "used" | "unknown" | "has-account"; // C2
export type LinkResult = "ok" | "pending" | "network"; // C3
export type SignInLink = "valid" | "used" | "expired" | "unknown" | "double"; // C4
export type PageState = "empty" | "draft" | "published" | "published-no-availability"; // C6
export type SaveResult = "ok" | "slug-taken" | "field-error" | "server" | "network" | "slow"; // C7
export type AvailabilityPreset = "none" | "set" | "short-notice"; // C8
export type AvailabilityResult = "ok" | "server" | "network" | "slow" | "too-many"; // C9
export type ZoneChoice = "warsaw" | "london" | "none"; // C10
export type SlotsSection = "ready" | "loading" | "error" | "offline"; // C11
export type PublicPath = "anna" | "piotr-n" | "ewa-szkic" | "annak2" | "m" | "m-search"; // C12
export type Width = "full" | "1024" | "375" | "320"; // C15
export type Loading = "short" | "stuck"; // C16 (dodana w prototypie)
export type Theme = "system" | "light" | "dark";

export type Sim = {
  role: Role;
  session: Session;
  inviteLink: InviteLink;
  linkResult: LinkResult;
  signInLink: SignInLink;
  pageState: PageState;
  /** Rośnie, gdy stan strony zmienia kontrolka (a nie akcja w formularzu) — edytor startuje od nowa. */
  pageVersion: number;
  pageValues: MentorPageValues;
  published: boolean;
  saveResult: SaveResult;
  windows: AvailabilityWindow[];
  mentorZone: string;
  availabilityVersion: number;
  availabilityResult: AvailabilityResult;
  zone: ZoneChoice;
  slotsSection: SlotsSection;
  publicPath: PublicPath;
  longDescription: boolean;
  plusDay: boolean;
  width: Width;
  loading: Loading;
  theme: Theme;
  /** Gdzie jest zapisany pierwszy zapis dostępności (pierwsza wizyta = strefa z przeglądarki). */
  availabilitySaved: boolean;
};

export const INITIAL: Sim = {
  role: "anna-bez-sesji",
  session: "brak",
  inviteLink: "valid",
  linkResult: "ok",
  signInLink: "valid",
  pageState: "empty",
  pageVersion: 0,
  pageValues: EMPTY_VALUES,
  published: false,
  saveResult: "ok",
  windows: [],
  mentorZone: DEFAULT_ZONE,
  availabilityVersion: 0,
  availabilityResult: "ok",
  zone: "warsaw",
  slotsSection: "ready",
  publicPath: "anna",
  longDescription: false,
  plusDay: false,
  width: "full",
  loading: "short",
  theme: "system",
  availabilitySaved: false,
};

type Store = {
  sim: Sim;
  set: (patch: Partial<Sim>) => void;
  /** Kontrolka C1 (rola) ustawia też C5 (sesję) i odwrotnie. */
  setRole: (role: Role) => void;
  setSession: (session: Session) => void;
  setPageState: (state: PageState) => void;
  setAvailabilityPreset: (preset: AvailabilityPreset) => void;
  reset: () => void;
  resetCount: number;
  now: Date;
  signedIn: boolean;
};

const StoreContext = createContext<Store | null>(null);

export function availabilityPresetOf(windows: AvailabilityWindow[]): AvailabilityPreset | "custom" {
  if (windows.length === 0) return "none";
  if (JSON.stringify(windows) === JSON.stringify(ANNA_WINDOWS)) return "set";
  if (JSON.stringify(windows) === JSON.stringify(SHORT_NOTICE_WINDOWS)) return "short-notice";
  return "custom";
}

export function SimProvider({ children }: { children: ReactNode }) {
  const [sim, setSim] = useState<Sim>(INITIAL);
  const [resetCount, setResetCount] = useState(0);

  const set = useCallback((patch: Partial<Sim>) => setSim((s) => ({ ...s, ...patch })), []);

  const setRole = useCallback((role: Role) => setSim((s) => ({ ...s, role, session: role === "anna" ? "aktywna" : "brak" })), []);

  const setSession = useCallback(
    (session: Session) => setSim((s) => ({ ...s, session, role: session === "aktywna" || session === "wygasa-przy-zapisie" ? "anna" : s.role === "anna" ? "anna-bez-sesji" : s.role })),
    [],
  );

  const setPageState = useCallback(
    (pageState: PageState) =>
      setSim((s) => ({
        ...s,
        pageState,
        pageVersion: s.pageVersion + 1,
        availabilityVersion: s.availabilityVersion + 1,
        pageValues: pageState === "empty" ? EMPTY_VALUES : ANNA_VALUES,
        published: pageState === "published" || pageState === "published-no-availability",
        windows: pageState === "published-no-availability" ? [] : pageState === "published" && s.windows.length === 0 ? ANNA_WINDOWS : s.windows,
        availabilitySaved: pageState === "published-no-availability" ? s.availabilitySaved : pageState === "published" ? true : s.availabilitySaved,
      })),
    [],
  );

  const setAvailabilityPreset = useCallback(
    (preset: AvailabilityPreset) =>
      setSim((s) => ({
        ...s,
        windows: preset === "none" ? [] : preset === "set" ? ANNA_WINDOWS : SHORT_NOTICE_WINDOWS,
        availabilitySaved: preset !== "none",
        availabilityVersion: s.availabilityVersion + 1,
        pageVersion: s.pageVersion + 1,
      })),
    [],
  );

  const reset = useCallback(() => {
    setSim(INITIAL);
    setResetCount((n) => n + 1);
  }, []);

  const value = useMemo<Store>(() => {
    const now = new Date(new Date(NOW_ISO).getTime() + (sim.plusDay ? DAY_MS : 0));
    const signedIn = sim.session === "aktywna" || sim.session === "wygasa-przy-zapisie";
    return { sim, set, setRole, setSession, setPageState, setAvailabilityPreset, reset, resetCount, now, signedIn };
  }, [sim, set, setRole, setSession, setPageState, setAvailabilityPreset, reset, resetCount]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useSim() {
  const store = useContext(StoreContext);
  if (!store) throw new Error("useSim poza SimProvider");
  return store;
}

/** Przejście do ekranu przez silnik przeglądu (historia „← Back”, fokus na nagłówku). */
export function goTo(screen: string) {
  document.dispatchEvent(new CustomEvent("prototype:navigate", { detail: screen }));
}

/** Komunikat w pasku przeglądu (region aria-live), np. o przechwyconym linku zewnętrznym. */
export function announce(text: string) {
  document.dispatchEvent(new CustomEvent("prototype:announce", { detail: text }));
}
