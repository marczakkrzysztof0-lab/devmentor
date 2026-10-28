// /mentor/requests/[id] — szczegóły i decyzja mentora (spec #18 „Screens”, story 1–4; ekran S9 w Storybooku).
//
// - Bramka DAL: bez sesji „Dostęp tylko przez zaproszenie…”; cudze / nieznane / nieopłacone zapytanie →
//   `RequestNotFound` („Nie ma takiego zapytania albo nie masz do niego dostępu”) — bez żadnych danych.
// - DS `RequestDecision`: pytanie, długość i termin PRZED przyciskami (AC); „Akceptuję” / „Odrzucam” z
//   potwierdzeniem (ConfirmDialog) i konsekwencją; odmowa z serwera → komunikat kodu (#18, C9–C10).
// - Po starcie terminu bez decyzji: „Termin minął — zwrot zostanie zlecony automatycznie”, bez przycisków.
// - Adres e-maila płacącego nigdy nie trafia na ekran mentora.
import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { Skeleton } from "@devmentor/ui";
import { AccessMessage, MentorNav, PageLayout, RequestDecision, RequestNotFound } from "@devmentor/ui/product";
import { loadMentorRequest } from "@/lib/requests/mentor-area";
import { signOutAction } from "../../actions";
import { acceptRequestAction, declineRequestAction } from "../actions";

export const metadata: Metadata = {
  title: "Zapytanie — DevMentor",
  robots: { index: false, follow: false },
};

export default function MentorRequestPage({ params }: PageProps<"/mentor/requests/[id]">) {
  return (
    <Suspense
      fallback={
        <PageLayout>
          <Skeleton label="Wczytywanie zapytania" lines={6} className="max-w-text" />
        </PageLayout>
      }
    >
      <RequestArea params={params} />
    </Suspense>
  );
}

async function RequestArea({ params }: Pick<PageProps<"/mentor/requests/[id]">, "params">) {
  await connection();
  const { id } = await params;
  const data = await loadMentorRequest(id);
  if (!data) {
    return (
      <PageLayout width="narrow">
        <AccessMessage kind="invitation-only" />
      </PageLayout>
    );
  }
  return (
    <PageLayout nav={<MentorNav current="requests" pendingCount={data.pendingCount} signOutAction={signOutAction} />}>
      {data.request ? (
        <RequestDecision
          request={data.request}
          timeZone={data.timeZone}
          now={data.now}
          onAccept={acceptRequestAction}
          onDecline={declineRequestAction}
        />
      ) : (
        <RequestNotFound />
      )}
    </PageLayout>
  );
}
