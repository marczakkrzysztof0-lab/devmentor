"use client";

// Pattern "Redirect to a hosted provider page" (A4, 2026-10-19): a server action creates a link at the
// payment provider (Stripe Checkout, Stripe Connect onboarding) and the browser leaves DevMentor.
// Same behaviour as the pay button of RequestForm (#17): one click, loading, spinner while leaving,
// error in words, no network, and the notice after coming back.

import { useId, useRef, useState, type ReactNode } from "react";

import { Alert } from "../../components/alert/Alert";
import { Button } from "../../components/button/Button";
import { Spinner } from "../../components/spinner/Spinner";
import { NETWORK_ACTION_MESSAGE } from "./form";

export type HostedOpenResult = { ok: true; url: string } | { ok: false };

export type HostedRedirectActionProps = {
  /** Verb + object, naming the provider: „Skonfiguruj wypłaty w Stripe”. */
  label: string;
  /** Provider name shown in the hint and the spinner: „Stripe”. */
  provider: string;
  /** `primary` when this is the screen's main action; otherwise `secondary`. */
  variant?: "primary" | "secondary";
  /** Server action that creates the provider link. Throwing = no network. */
  open: () => Promise<HostedOpenResult>;
  /** Sends the browser to the provider; default `window.location.assign`. */
  onRedirect?: (url: string) => void;
  /** What did not change if opening fails, e.g. „Dane do wypłaty i kwoty się nie zmieniły.” */
  unchanged?: ReactNode;
};

/** Button that leaves DevMentor for a hosted provider page, announcing it before the click (C2). */
export function HostedRedirectAction({ label, provider, variant = "primary", open, onRedirect = (url) => window.location.assign(url), unchanged }: HostedRedirectActionProps) {
  const hintId = useId();
  const busy = useRef(false);
  const [pending, setPending] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [problem, setProblem] = useState<null | "failed" | "network">(null);

  const start = async () => {
    if (busy.current || redirecting) return; // double click → nothing
    busy.current = true;
    setPending(true);
    setProblem(null);
    try {
      const result = await open();
      if (result.ok) {
        setRedirecting(true);
        onRedirect(result.url);
      } else setProblem("failed");
    } catch {
      setProblem("network");
    } finally {
      busy.current = false;
      setPending(false);
    }
  };

  return (
    <div className="flex flex-col items-start gap-in-group">
      {problem ? (
        <Alert tone="danger" title={problem === "network" ? NETWORK_ACTION_MESSAGE : `Nie udało się otworzyć strony ${provider} — spróbuj ponownie`}>
          {unchanged}
        </Alert>
      ) : null}
      <Button variant={variant} loading={pending || redirecting} aria-describedby={hintId} onClick={() => void start()}>
        {label}
      </Button>
      {redirecting ? (
        <Spinner size="sm" label={`Przekierowujemy do ${provider}…`} className="text-meta" />
      ) : (
        <p id={hintId} className="text-meta text-muted">
          Otworzy się strona {provider}. Po zakończeniu wrócisz na tę stronę.
        </p>
      )}
    </div>
  );
}

export type HostedReturnNoticeProps = {
  /** Read from the return URL (e.g. `?stripe=return` / `?stripe=refresh`). */
  result: "completed" | "interrupted";
  provider: string;
  /** Overrides the default title (e.g. for Checkout the request page shows its own state instead). */
  title?: string;
  /** What happens next. */
  children?: ReactNode;
};

/** Notice after coming back from the provider: completed = success, interrupted = attention (the user must finish). */
export function HostedReturnNotice({ result, provider, title, children }: HostedReturnNoticeProps) {
  return result === "completed" ? (
    <Alert tone="success" title={title ?? `Konfiguracja na stronie ${provider} zakończona`}>
      {children}
    </Alert>
  ) : (
    <Alert tone="attention" title={title ?? `Na stronie ${provider} nie wszystko zostało dokończone — dokończ, żeby kontynuować`}>
      {children ?? "Dane podane do tej pory zostały u dostawcy. Nic nie zostało pobrane."}
    </Alert>
  );
}
