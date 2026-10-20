// s06 publiczna strona mentora /m/{slug}, s07 „Nie ma takiej strony mentora” (#16).
import { useState } from "react";
import { LengthToggle, MentorDescription, MentorIdentity, MentorNotFound, PageLayout, PriceList, SlotList, type SessionLength } from "@devmentor/ui/product";

import { LONG_DESCRIPTION, PIOTR, browserZone, slotsFromWindows, toMinor } from "../data";
import { Screen, SimGoto, SimNote } from "../Screen";
import { useSim, type PublicPath, type Sim } from "../store";

export function publicRoute(sim: Sim) {
  const routes: Record<PublicPath, string> = {
    anna: `/m/${sim.pageValues.slug}`,
    "piotr-n": "/m/piotr-n",
    "ewa-szkic": "/m/ewa-szkic",
    annak2: "/m/annak2",
    m: "/m",
    "m-search": "/m?search=react",
  };
  return routes[sim.publicPath];
}

type PublicPage = { displayName: string; publicWorkUrl: string; description: string; price25Minor: number; price50Minor: number; hasWindows: boolean };

/** Co pokazuje adres z C12: opublikowaną stronę albo nic (szkic, literówka, /m, /m?search=). */
export function resolvePublicPage(sim: Sim, long: boolean): PublicPage | null {
  if (sim.publicPath === "anna") {
    if (!sim.published) return null; // szkic Anny → s07 (16-A4)
    return {
      displayName: sim.pageValues.displayName,
      publicWorkUrl: sim.pageValues.publicWorkUrl,
      description: long ? LONG_DESCRIPTION : sim.pageValues.description,
      price25Minor: toMinor(sim.pageValues.price25),
      price50Minor: toMinor(sim.pageValues.price50),
      hasWindows: true,
    };
  }
  if (sim.publicPath === "piotr-n") return { ...PIOTR, description: long ? LONG_DESCRIPTION : PIOTR.description, hasWindows: false };
  return null;
}

const NOTES_S06 = (
  <>
    <p>
      <strong>Historie:</strong> #16 story 1–3 · 16-A1…A3, A5…A8 · brief, krok 1 developera · L1 (wersja #16 bez formularza zapytania).
    </p>
    <p>
      <strong>Symulacja:</strong> strefę widza ustawia C10, stan sekcji terminów C11, adres C12, długi opis C13, zegar C14. Link do publicznej pracy nie otwiera zewnętrznej strony.
    </p>
    <p>
      <strong>Nie rozstrzyga:</strong> zmiany ceny w trakcie oglądania (16 Edge, niewidoczne w E01). Brak przycisku „Zarezerwuj” celowo (#16 Q1); zapytania to E02.
    </p>
  </>
);

export function S06PublicPage() {
  const { sim, now } = useSim();
  const [length, setLength] = useState<SessionLength>(25);
  const page = resolvePublicPage(sim, sim.longDescription);
  const viewerZone = browserZone(sim.zone);
  const slots = page?.hasWindows ? slotsFromWindows(sim.windows, sim.mentorZone, now) : [];

  return (
    <Screen id="s06" title="Publiczna strona mentora" route={publicRoute(sim)} notes={NOTES_S06}>
      <PageLayout width="narrow">
        {page ? (
          <>
            {/* LUKA DS D1: brak kompozycji ekranu tylko z #16; złożone z komponentów #16 w kolejności 16-A1. */}
            <div className="flex flex-col gap-between-groups">
              <MentorIdentity displayName={page.displayName} publicWorkUrl={page.publicWorkUrl} />
              <MentorDescription text={page.description} />
            </div>
            <div className="flex flex-col gap-between-groups">
              <PriceList price25Minor={page.price25Minor} price50Minor={page.price50Minor} />
              <LengthToggle price25Minor={page.price25Minor} price50Minor={page.price50Minor} value={length} onValueChange={setLength} />
              <SlotList slots={slots} length={length} timeZone={viewerZone} now={now} state={sim.slotsSection} />
            </div>
          </>
        ) : (
          <>
            <SimNote action={<SimGoto screen="s07">Zobacz s07</SimGoto>}>Adres {publicRoute(sim)} nie prowadzi do opublikowanej strony — aplikacja pokazuje s07.</SimNote>
            <MentorNotFound />
          </>
        )}
      </PageLayout>
    </Screen>
  );
}

export function S07NotFound() {
  const { sim } = useSim();
  const route = resolvePublicPage(sim, false) ? "/m/annak2" : publicRoute(sim);
  return (
    <Screen
      id="s07"
      title="Nie ma takiej strony mentora"
      route={route}
      notes={
        <>
          <p>
            <strong>Historie:</strong> #16 story 4, 5 · 16-A4, 16-A6 · L18 (Ewa = szkic).
          </p>
          <p>
            <strong>Symulacja:</strong> ten sam ekran dla szkicu, literówki, /m i /m?search= (C12). Zero danych mentora i bez podpowiedzi, czy adres istnieje.
          </p>
          <p>
            <strong>Nie rozstrzyga:</strong> treści strony / (L19, poza prototypem).
          </p>
        </>
      }
    >
      <PageLayout width="narrow">
        <MentorNotFound />
      </PageLayout>
    </Screen>
  );
}
