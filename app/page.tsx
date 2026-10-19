// Values come only from the design-system tokens (packages/ui/src/styles/tokens.css, decision A1 2026-10-19).
export default function Home() {
  return (
    <main className="flex flex-1 items-center justify-center bg-surface-page px-page-gutter py-between-sections font-ui text-primary">
      <section className="w-full max-w-page rounded-control border border-divider bg-surface-panel px-between-groups py-between-sections text-center">
        <p className="mb-in-group text-meta font-strong uppercase text-muted">
          Rozwijaj się w IT
        </p>
        <h1 className="text-heading-page font-strong text-primary">
          DevMentor
        </h1>
        <p className="mx-auto mt-between-groups max-w-text text-body text-muted">
          Portal, który pomaga rozwijać umiejętności programistyczne. Znajdź
          wiedzę, inspirację i wsparcie na każdym etapie swojej drogi w IT.
        </p>
      </section>
    </main>
  );
}
