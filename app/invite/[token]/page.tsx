// /invite/[token] — s01 (spec #14 story 1, UI/UX). GET tylko pokazuje przycisk: link nie jest zużywany
// przy otwarciu (podglądy linków, skanery poczty). Stan linku to odczyt żądania (params, ciasteczko,
// baza), więc z `cacheComponents` siedzi za <Suspense> i nie jest prerenderowany przy `next build`.
import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Spinner } from "@devmentor/ui";
import { AccessMessage, InvitationPanel, PageLayout } from "@devmentor/ui/product";
import { inspectInvitationLink } from "@/lib/auth/session";
import { formatLinkExpiry, isLinkTokenShape } from "@/lib/auth/tokens.mjs";
import { acceptInvitationAction } from "./actions";

/** Parametry trasy dynamicznej — w Next 16 `params` to Promise (odczyt w czasie żądania). */
type TokenParams = Promise<{ token: string }>;

export const metadata: Metadata = {
  title: "Zaproszenie — DevMentor",
  robots: { index: false, follow: false },
};

export default function InvitePage({ params }: { params: TokenParams }) {
  return (
    <PageLayout width="narrow">
      <Suspense fallback={<Spinner label="Sprawdzanie linku" />}>
        <Invitation params={params} />
      </Suspense>
    </PageLayout>
  );
}

async function Invitation({ params }: { params: TokenParams }) {
  const { token } = await params;
  // Ważność linku zależy od bieżącej chwili — zawsze w czasie żądania, nigdy w prefetchu/prerenderze.
  await connection();
  const link = isLinkTokenShape(token) ? await inspectInvitationLink(token) : ({ status: "inactive" } as const);
  // Zaproszenie przyjęte, a ta sama osoba jest zalogowana: prosto do edytora (14-A4).
  if (link.status === "signed-in-as-owner") redirect("/mentor");
  if (link.status === "inactive") return <AccessMessage kind="inactive-link" />;
  return (
    <InvitationPanel
      kind="invite"
      expiresLabel={`${formatLinkExpiry(link.expiresAt)} (czas polski)`}
      onAccept={acceptInvitationAction.bind(null, token)}
    />
  );
}
