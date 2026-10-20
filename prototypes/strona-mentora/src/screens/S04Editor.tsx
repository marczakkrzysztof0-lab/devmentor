// s04 edytor strony /mentor (#14, #15 story 3).
import { useState } from "react";
import { Alert, CopyField, Panel, Skeleton } from "@devmentor/ui";
import { MentorPageForm, NoAvailabilityNotice, PageLayout, type MentorPageValues, type SaveMentorPageResult } from "@devmentor/ui/product";

import { BASE_URL, wait } from "../data";
import { MentorNavE01, Screen, SimNote, useArrivalLoading } from "../Screen";
import { goTo, useSim } from "../store";
import { MentorGate } from "./S01S02S03";

const SESSION_EXPIRED = "Sesja wygasła — poproś zespół o link do logowania"; // L6

export function S04Editor() {
  const { sim, set, signedIn, resetCount } = useSim();
  const { loading, arrival } = useArrivalLoading("s04");
  // Wejście, w którym sesja wygasła przy zapisie: formularz zostaje na ekranie (L6); kolejne wejście = bramka (14-S2).
  const [expiredAt, setExpiredAt] = useState(-1);
  const sessionExpired = expiredAt === arrival;
  // Wejście, w którym strona została opublikowana: wtedy panel z linkiem pokazuje sam formularz (14-E6).
  const [publishedAt, setPublishedAt] = useState(-1);

  const signOut = () => {
    set({ session: "brak", role: "anna-bez-sesji" });
    goTo("s03");
  };

  const action = async (values: MentorPageValues, { publish }: { publish: boolean }): Promise<SaveMentorPageResult> => {
    if (sim.saveResult === "network") {
      await wait(400);
      throw new Error("Symulacja: brak sieci");
    }
    await wait(sim.saveResult === "slow" ? 6000 : 700);
    if (sim.session === "wygasa-przy-zapisie") {
      // L6: dane zostają w formularzu, bez przekierowania.
      // LUKA DS D5: SaveMentorPageResult nie ma kodu „brak sesji”, więc formularz pokazuje też ogólny błąd serwera.
      setExpiredAt(arrival);
      set({ session: "wygasla", role: "anna-bez-sesji" });
      return { ok: false };
    }
    if (sim.saveResult === "server") return { ok: false, code: "server_error" };
    if (sim.saveResult === "slug-taken" && publish && !sim.published) return { ok: false, errors: { slug: "Ten adres jest zajęty" } }; // 14-E4
    if (sim.saveResult === "field-error") return { ok: false, errors: { publicWorkUrl: "Link musi zaczynać się od https:// albo http://" } };
    if (publish && !sim.published) {
      setPublishedAt(arrival);
      set({ pageValues: values, published: true, pageState: sim.windows.length ? "published" : "published-no-availability" });
      return { ok: true, shareUrl: `${BASE_URL}/m/${values.slug}` };
    }
    set({ pageValues: values, pageState: sim.published ? sim.pageState : "draft" });
    return { ok: true };
  };

  const blocked = !signedIn && sim.session !== "inny-mentor" && !sessionExpired;
  const shareUrl = `${BASE_URL}/m/${sim.pageValues.slug}`;

  return (
    <Screen
      id="s04"
      title="Edytor strony"
      route="/mentor"
      notes={
        <>
          <p>
            <strong>Historie:</strong> #14 story 2, 3 · #15 story 3 · 14-E1…E7 · L6, L8, L9, L10, L20.
          </p>
          <p>
            <strong>Symulacja:</strong> zapis i publikacja nie trafiają na serwer; wynik ustawia C7, stan strony C6, sesję C5. „Kopiuj link” kopiuje adres demo do schowka.
          </p>
          <p>
            <strong>Nie rozstrzyga:</strong> podglądu strony przed publikacją (L13, poza 1.0) ani ostrzeżenia o niezapisanych zmianach (L21). Propozycja adresu z imienia nie działa przy slugu zastępczym (LUKA DS D4).
          </p>
        </>
      }
    >
      {blocked ? (
        <MentorGate reason={sim.session === "wygasla" ? "Sesja wygasła lub została odwołana (14-S2)." : "Brak sesji mentora (14-S1)."} />
      ) : (
        <PageLayout nav={<MentorNavE01 current="page" onSignOut={signOut} />}>
          {sim.session === "inny-mentor" ? (
            <SimNote>Zalogowany jest inny mentor: aplikacja pokazałaby jego stronę. Prototyp nie ma jego danych — przełącz C5 na „aktywna”.</SimNote>
          ) : loading ? (
            // LUKA DS D9: brak kompozycji stanu ładowania edytora; złożone ze Skeleton.
            <div className="flex max-w-text flex-col gap-between-groups">
              <Skeleton label="Wczytywanie strony" />
            </div>
          ) : (
            <div className="flex flex-col gap-between-groups">
              {sim.windows.length === 0 ? <NoAvailabilityNotice href="#s05" /> : null}
              {sim.published && publishedAt !== arrival ? (
                // LUKA DS D6: ShareLinkPanel zawsze przenosi fokus; stały panel po publikacji (L8) złożony z Panel + CopyField bez autofokusu.
                <div className="max-w-text">
                  <Panel title="Strona opublikowana">
                    <CopyField label="Twój link" value={shareUrl} hint="Wklej go tam, gdzie ludzie już cię pytają." />
                  </Panel>
                </div>
              ) : null}
              {sessionExpired ? (
                <div className="max-w-text">
                  <Alert tone="danger" title={SESSION_EXPIRED}>
                    Wpisane dane zostały w formularzu.
                  </Alert>
                </div>
              ) : null}
              {sim.saveResult === "slow" ? <SimNote>Następny zapis będzie trwał około 6 sekund (C7 „długo trwa”).</SimNote> : null}
              <MentorPageForm key={`${resetCount}-${sim.pageVersion}`} initial={sim.pageValues} published={sim.published} baseUrl={BASE_URL} action={action} />
            </div>
          )}
        </PageLayout>
      )}
    </Screen>
  );
}
