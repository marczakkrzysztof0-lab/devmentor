import { useEffect } from "react";

import { ReviewBar } from "./ReviewBar";
import { S01Invitation, S02SignIn, S03NoAccess } from "./screens/S01S02S03";
import { S04Editor } from "./screens/S04Editor";
import { S05Availability } from "./screens/S05Availability";
import { S06PublicPage, S07NotFound } from "./screens/S06S07Public";
import { announce } from "./store";

declare global {
  interface Window {
    __PROTOTYPE_START__?: () => boolean;
  }
}

export function App() {
  useEffect(() => {
    window.__PROTOTYPE_START__?.();
    // Linki zewnętrzne (np. github.com/annak) nie wychodzą z prototypu (zasada 4: nic nie udaje prawdziwej usługi).
    const onClick = (event: MouseEvent) => {
      const link = (event.target as Element | null)?.closest?.("a[href^='http']");
      if (!link || !link.closest(".frame") || document.body.classList.contains("proto-comment")) return;
      event.preventDefault();
      announce(`Symulacja: link zewnętrzny ${link.getAttribute("href")} nie jest otwierany w prototypie.`);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  return (
    <>
      <ReviewBar />
      <div className="doc">
        <div className="doc-head">
          <h1>Strona mentora — klikalny prototyp E01 (s01–s07)</h1>
          <p>Dane fikcyjne. Płatności, maile i logowanie przez zewnętrzne serwisy nie występują w E01; linki od foundera są symulowane.</p>
        </div>
        <S01Invitation />
        <S02SignIn />
        <S03NoAccess />
        <S04Editor />
        <S05Availability />
        <S06PublicPage />
        <S07NotFound />
      </div>
    </>
  );
}
