// Segment /m/* — publiczne strony mentorów (spec #16). Wspólne metadane każdej odpowiedzi w segmencie, także
// 404 (szkic, nieznany lub niepoprawny slug, samo /m): `noindex, nofollow` (Q2 — wskazówka dla robotów, nie
// gwarancja; R14 spełnia brak katalogu, wyszukiwarki, sitemap i linków do /m/* w aplikacji).
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Nie ma takiej strony mentora — DevMentor",
  robots: { index: false, follow: false },
};

export default function MentorPagesLayout({ children }: LayoutProps<"/m">) {
  return children;
}
