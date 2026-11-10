// Prompt wypłat po pierwszej opłaconej prośbie mentora (spec 2026-11-09, ekran S03).
import { Alert } from "../../components/alert/Alert";
import { StatusText } from "../../components/status-text/StatusText";
import { TextLink } from "../../components/text-link/TextLink";
import { HostedRedirectAction } from "../shared/HostedRedirect";

type PayoutSetupPromptProps = {
  action: () => Promise<{ ok: true; url: string } | { ok: false }>;
};

/** Prompts a mentor to configure Stripe payouts after the first paid request.
 * @param props onboarding action
 * @returns payout setup prompt
 */
export function PayoutSetupPrompt({ action }: PayoutSetupPromptProps) {
  return (
    <Alert tone="attention" title="Skonfiguruj wypłaty, żeby otrzymać zarobione pieniądze">
      <div className="flex flex-col gap-in-group">
        <p>Dane do wypłaty podasz bezpiecznie na stronie Stripe.</p>
        <HostedRedirectAction
          label="Skonfiguruj wypłaty w Stripe"
          provider="Stripe"
          open={action}
          unchanged="Dane do wypłaty i kwoty się nie zmieniły."
        />
        <TextLink href="/mentor/payouts">Zobacz stan wypłat</TextLink>
      </div>
    </Alert>
  );
}

/** Pokazuje gotowość wypłat mentora po pierwszym opłaconym pytaniu. */
export function PayoutsReadyLine() {
  return (
    <p className="flex flex-wrap items-center gap-in-group">
      <StatusText tone="success">Wypłaty gotowe</StatusText>
      <TextLink href="/mentor/payouts">Zobacz wypłaty</TextLink>
    </p>
  );
}
