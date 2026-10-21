// /sign-in/[token] — s02 (spec #14 story 3, UI/UX). GET tylko pokazuje przycisk „Zaloguj”; link zużywa
// dopiero server action. Ta sama, już zalogowana osoba z własnym linkiem → /mentor bez zużycia (L5, Z6).
import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Spinner } from "@devmentor/ui";
import { AccessMessage, InvitationPanel, PageLayout } from "@devmentor/ui/product";
import { inspectSignInLinkForRequest } from "@/lib/auth/session";
import { formatLinkExpiry, isLinkTokenShape } from "@/lib/auth/tokens.mjs";
import { redeemSignInLinkAction } from "./actions";

/** Parametry trasy dynamicznej — w Next 16 `params` to Promise (odczyt w czasie żądania). */
type TokenParams = Promise<{ token: string }>;

export const metadata: Metadata = {
  title: "Logowanie — DevMentor",
  robots: { index: false, follow: false },
};

export default function SignInPage({ params }: { params: TokenParams }) {
  return (
    <PageLayout width="narrow">
      <Suspense fallback={<Spinner label="Sprawdzanie linku" />}>
        <SignInLink params={params} />
      </Suspense>
    </PageLayout>
  );
}

async function SignInLink({ params }: { params: TokenParams }) {
  const { token } = await params;
  // Ważność linku zależy od bieżącej chwili — zawsze w czasie żądania, nigdy w prefetchu/prerenderze.
  await connection();
  const link = isLinkTokenShape(token) ? await inspectSignInLinkForRequest(token) : ({ status: "inactive" } as const);
  if (link.status === "signed-in-as-owner") redirect("/mentor");
  if (link.status === "inactive") return <AccessMessage kind="inactive-link" />;
  return (
    <InvitationPanel
      kind="sign-in"
      expiresLabel={`${formatLinkExpiry(link.expiresAt)} (czas polski)`}
      onAccept={redeemSignInLinkAction.bind(null, token)}
    />
  );
}
