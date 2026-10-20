// s01 zaproszenie, s02 logowanie linkiem, s03 brak dostępu (#14).
import { AccessMessage, InvitationPanel, PageLayout } from "@devmentor/ui/product";

import { INVITE_EXPIRES, SIGN_IN_EXPIRES, wait } from "../data";
import { Screen, SimGoto, SimNote } from "../Screen";
import { goTo, useSim, type LinkResult } from "../store";

/** Wynik kliknięcia w linku (C3): sukces po chwili, „długo trwa” (bez końca) albo brak sieci. */
async function simulateLink(result: LinkResult): Promise<void> {
  if (result === "network") {
    await wait(400);
    throw new Error("Symulacja: brak sieci");
  }
  if (result === "pending") await new Promise<never>(() => undefined);
  await wait(700);
}

const INVITE_TOKENS: Record<string, string> = {
  valid: "demo-valid",
  expired: "demo-expired",
  revoked: "demo-revoked",
  used: "demo-used",
  unknown: "demo-unknown",
  "has-account": "demo-valid",
};

export function S01Invitation() {
  const { sim, set, resetCount } = useSim();
  const sameMentorSignedIn = sim.session === "aktywna" || sim.session === "wygasa-przy-zapisie";
  const alreadyAccepted = sim.inviteLink === "used" && sameMentorSignedIn; // K1, 14-A4
  const inactive = !alreadyAccepted && sim.inviteLink !== "valid"; // BD, 14-A3, L3, L4

  const accept = async () => {
    await simulateLink(sim.linkResult);
    // 14-A2: akceptacja tworzy mentora, szkic strony ze slugiem zastępczym i sesję; L5: zamienia starą sesję.
    set({ session: "aktywna", role: "anna", inviteLink: "used" });
    goTo("s04");
    return { ok: true as const };
  };

  return (
    <Screen
      id="s01"
      title="Zaproszenie"
      route={`/invite/${INVITE_TOKENS[sim.inviteLink]}`}
      notes={
        <>
          <p>
            <strong>Historie:</strong> #14 story 1, 4, 5 · 14-A1…A5 · decyzje L2, L3, L4, L5.
          </p>
          <p>
            <strong>Symulacja:</strong> link wysyła founder ręcznie (CLI, pasek przeglądu → Founder). Akceptacja nie tworzy konta naprawdę; wynik ustawia C3. Stan linku ustawia C2.
          </p>
          <p>
            <strong>Nie rozstrzyga:</strong> kanału kontaktu z zespołem (L12, otwarte przed wyjściem poza pilotaż).
          </p>
        </>
      }
    >
      <PageLayout width="narrow">
        {sim.session === "inny-mentor" && sim.inviteLink === "valid" ? (
          <SimNote>W tej przeglądarce jest zalogowany inny mentor. Kliknięcie kończy jego sesję i loguje osobę z zaproszenia (L5).</SimNote>
        ) : null}
        {alreadyAccepted ? (
          <SimNote action={<SimGoto screen="s04">Wykonaj przekierowanie do /mentor</SimGoto>}>
            Zaproszenie jest już przyjęte, a ta sama mentorka jest zalogowana. Aplikacja od razu przekierowuje do edytora (14-A4); prototyp pokazuje to jako krok do kliknięcia.
          </SimNote>
        ) : inactive ? (
          <AccessMessage kind="inactive-link" />
        ) : (
          <InvitationPanel key={`${resetCount}-${sim.inviteLink}-${sim.linkResult}-${sim.session}`} kind="invite" expiresLabel={INVITE_EXPIRES} onAccept={accept} />
        )}
      </PageLayout>
    </Screen>
  );
}

const SIGN_IN_TOKENS: Record<string, string> = { valid: "demo-valid", used: "demo-used", expired: "demo-expired", unknown: "demo-unknown", double: "demo-valid" };

export function S02SignIn() {
  const { sim, set, resetCount } = useSim();
  const alreadySignedIn = sim.session === "aktywna" && sim.signInLink === "valid"; // L5: bez zużycia tokenu
  const inactive = sim.signInLink === "used" || sim.signInLink === "expired" || sim.signInLink === "unknown";

  const signIn = async () => {
    await simulateLink(sim.linkResult);
    if (sim.signInLink === "double") {
      // 14-L1: druga karta wygrała — jedna sesja; ta próba dostaje neutralny komunikat.
      set({ session: "aktywna", role: "anna", signInLink: "used" });
      return { ok: false as const };
    }
    set({ session: "aktywna", role: "anna", signInLink: "used" });
    goTo("s04");
    return { ok: true as const };
  };

  return (
    <Screen
      id="s02"
      title="Logowanie linkiem"
      route={`/sign-in/${SIGN_IN_TOKENS[sim.signInLink]}`}
      notes={
        <>
          <p>
            <strong>Historie:</strong> #14 story 3 · 14-L1, 14-A3 · L5, L17 (ważność 72 h).
          </p>
          <p>
            <strong>Symulacja:</strong> link logowania wydaje founder przez CLI; stan linku ustawia C4, wynik kliknięcia C3. „Podwójne kliknięcie” udaje drugą kartę, która zalogowała pierwsza.
          </p>
          <p>
            <strong>Nie rozstrzyga:</strong> jak mentor prosi o nowy link (L12).
          </p>
        </>
      }
    >
      <PageLayout width="narrow">
        {sim.signInLink === "double" ? <SimNote>Ten sam link jest właśnie otwarty w drugiej karcie, która zaloguje się pierwsza. Ta karta po kliknięciu dostaje komunikat o nieaktywnym linku (14-L1).</SimNote> : null}
        {sim.session === "inny-mentor" && sim.signInLink === "valid" ? <SimNote>W tej przeglądarce jest zalogowany inny mentor. Kliknięcie zamienia sesję (L5).</SimNote> : null}
        {alreadySignedIn ? (
          <SimNote action={<SimGoto screen="s04">Wykonaj przekierowanie do /mentor</SimGoto>}>
            Ta sama mentorka jest już zalogowana. Aplikacja przekierowuje do /mentor bez zużycia linku (L5).
          </SimNote>
        ) : inactive ? (
          <AccessMessage kind="inactive-link" />
        ) : (
          <InvitationPanel key={`${resetCount}-${sim.signInLink}-${sim.linkResult}-${sim.session}`} kind="sign-in" expiresLabel={SIGN_IN_EXPIRES} onAccept={signIn} />
        )}
      </PageLayout>
    </Screen>
  );
}

export function S03NoAccess() {
  return (
    <Screen
      id="s03"
      title="Brak dostępu"
      route="/mentor (bez sesji)"
      notes={
        <>
          <p>
            <strong>Historie:</strong> #14 story 3, 4 · 14-S1, 14-S2 · L7 (po „Wyloguj”), L14 (/mentor/availability).
          </p>
          <p>
            <strong>Symulacja:</strong> brak rejestracji i formularza; wejście tylko przez link od zespołu (pasek przeglądu → Founder → link logowania).
          </p>
          <p>
            <strong>Nie rozstrzyga:</strong> kanału kontaktu z zespołem (L12).
          </p>
        </>
      }
    >
      <PageLayout width="narrow">
        <AccessMessage kind="invitation-only" />
      </PageLayout>
    </Screen>
  );
}

/** Bramka ekranów mentora (s04, s05): bez sesji ten sam komunikat co s03 (14-S1, 14-S2, L14). */
export function MentorGate({ reason }: { reason: string }) {
  return (
    <PageLayout width="narrow">
      <SimNote action={<SimGoto screen="s03">Zobacz s03</SimGoto>}>{reason} Aplikacja pokazuje tu ekran s03.</SimNote>
      <AccessMessage kind="invitation-only" />
    </PageLayout>
  );
}
