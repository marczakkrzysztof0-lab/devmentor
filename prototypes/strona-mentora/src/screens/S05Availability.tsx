// s05 dostępność /mentor/availability (#15).
import { useState } from "react";
import { Alert, Skeleton } from "@devmentor/ui";
import { AvailabilityEditor, PageLayout, type AvailabilityWindow, type SaveAvailabilityResult } from "@devmentor/ui/product";

import { DEFAULT_ZONE, MAX_WINDOWS, TOO_MANY_WINDOWS, ZONES, browserZone, slotsFromWindows, wait } from "../data";
import { MentorNavE01, Screen, SimNote, useArrivalLoading } from "../Screen";
import { goTo, useSim } from "../store";
import { MentorGate } from "./S01S02S03";

type Refusal = "none" | "session" | "too-many";

export function S05Availability() {
  const { sim, set, signedIn, now, resetCount } = useSim();
  const { loading, arrival } = useArrivalLoading("s05");
  const [refusal, setRefusal] = useState<{ kind: Refusal; at: number }>({ kind: "none", at: -1 });
  const refused = refusal.at === arrival ? refusal.kind : "none";

  // Pierwsza wizyta: strefa z przeglądarki (15-A1); gdy jej nie ma — Europe/Warsaw (L15).
  const firstVisit = !sim.availabilitySaved;
  const detected = browserZone(sim.zone);
  const zone = firstVisit ? (detected ?? DEFAULT_ZONE) : sim.mentorZone;
  const windows = sim.availabilityResult === "too-many" ? TOO_MANY_WINDOWS : sim.windows;

  const signOut = () => {
    set({ session: "brak", role: "anna-bez-sesji" });
    goTo("s03");
  };

  const action = async (input: { timeZone: string; windows: AvailabilityWindow[] }): Promise<SaveAvailabilityResult> => {
    setRefusal({ kind: "none", at: arrival });
    if (sim.availabilityResult === "network") {
      await wait(400);
      throw new Error("Symulacja: brak sieci");
    }
    await wait(sim.availabilityResult === "slow" ? 6000 : 700);
    if (sim.session === "wygasa-przy-zapisie") {
      // L6 + LUKA DS D5: SaveAvailabilityResult nie ma kodu „brak sesji”.
      setRefusal({ kind: "session", at: arrival });
      set({ session: "wygasla", role: "anna-bez-sesji" });
      return { ok: false };
    }
    if (input.windows.length > MAX_WINDOWS) {
      // L16 + LUKA DS D8: AvailabilityEditor nie ma limitu ani disabledReason na „+ okno”; odmowa po próbie zapisu.
      setRefusal({ kind: "too-many", at: arrival });
      return { ok: false };
    }
    if (sim.availabilityResult === "server") return { ok: false };
    // 15-A2: zapis zastępuje cały zestaw i od razu działa (także na szkicu).
    set({
      windows: input.windows,
      mentorZone: input.timeZone,
      availabilitySaved: true,
      availabilityResult: sim.availabilityResult === "too-many" ? "ok" : sim.availabilityResult,
      pageState: sim.published ? (input.windows.length ? "published" : "published-no-availability") : sim.pageState,
    });
    return { ok: true, preview: slotsFromWindows(input.windows, input.timeZone, now) };
  };

  // L6: po wygaśnięciu sesji przy zapisie okna zostają na ekranie; kolejne wejście = bramka.
  const blocked = !signedIn && sim.session !== "inny-mentor" && refused !== "session";

  return (
    <Screen
      id="s05"
      title="Dostępność"
      route="/mentor/availability"
      notes={
        <>
          <p>
            <strong>Historie:</strong> #15 story 1–3 · 15-A1…A6, 15-R · L6, L14, L15, L16, L20.
          </p>
          <p>
            <strong>Symulacja:</strong> terminy liczy prototyp w przeglądarce (siatka :00/:30, 3 h wyprzedzenia, horyzont 14 dni) od stałego „teraz” 19.10.2026, 19:00. Wynik zapisu ustawia C9, okna C8, strefę przeglądarki C10.
          </p>
          <p>
            <strong>Nie rozstrzyga:</strong> konfliktu z zapytaniami (E02, Q7). Dni w DS są liczone 0–6, w specyfikacji 1–7 (LUKA DS D8). Pusty stan pokazuje ten sam tekst dwa razy (LUKA DS D11).
          </p>
        </>
      }
    >
      {blocked ? (
        <MentorGate reason="Brak sesji mentora na /mentor/availability (L14)." />
      ) : (
        <PageLayout nav={<MentorNavE01 current="availability" onSignOut={signOut} />}>
          {sim.session === "inny-mentor" ? (
            <SimNote>Zalogowany jest inny mentor: aplikacja pokazałaby jego okna. Przełącz C5 na „aktywna”.</SimNote>
          ) : loading ? (
            // LUKA DS D9: brak kompozycji stanu ładowania dostępności; złożone ze Skeleton.
            <div className="flex max-w-text flex-col gap-between-groups">
              <Skeleton label="Wczytywanie dostępności" />
            </div>
          ) : (
            <div className="flex flex-col gap-between-groups">
              {firstVisit && !detected ? <SimNote>Przeglądarka nie podała strefy czasowej — pole startuje od Europe/Warsaw (L15).</SimNote> : null}
              {sim.availabilityResult === "too-many" ? <SimNote>Na ekranie są 22 niezapisane okna (C9). Zapis zostanie odrzucony: limit to 21.</SimNote> : null}
              {sim.availabilityResult === "slow" ? <SimNote>Następny zapis będzie trwał około 6 sekund (C9 „długo trwa”).</SimNote> : null}
              {refused === "session" ? (
                <div className="max-w-text">
                  <Alert tone="danger" title="Sesja wygasła — poproś zespół o link do logowania">
                    Twoje okna zostały na ekranie.
                  </Alert>
                </div>
              ) : null}
              {refused === "too-many" ? (
                <div className="max-w-text">
                  <Alert tone="danger" title={`Maksymalnie ${MAX_WINDOWS} okien w tygodniu`}>
                    Usuń część okien i zapisz ponownie.
                  </Alert>
                </div>
              ) : null}
              <AvailabilityEditor
                key={`${resetCount}-${sim.availabilityVersion}-${sim.availabilityResult === "too-many"}-${sim.zone}-${sim.plusDay}`}
                timeZone={zone}
                zones={ZONES}
                windows={windows}
                preview={sim.availabilitySaved ? slotsFromWindows(sim.windows, sim.mentorZone, now) : []}
                now={now}
                action={action}
              />
            </div>
          )}
        </PageLayout>
      )}
    </Screen>
  );
}
