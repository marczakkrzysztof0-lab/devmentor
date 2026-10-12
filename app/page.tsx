export default function Home() {
  return (
    <main className="flex flex-1 items-center justify-center bg-zinc-50 px-6 py-24 font-sans dark:bg-black">
      <section className="w-full max-w-3xl rounded-3xl bg-white px-8 py-16 text-center shadow-sm dark:bg-zinc-950 sm:px-16">
        <p className="mb-4 text-sm font-semibold uppercase tracking-[0.2em] text-blue-600 dark:text-blue-400">
          Rozwijaj się w IT
        </p>
        <h1 className="text-5xl font-bold tracking-tight text-zinc-950 dark:text-zinc-50 sm:text-6xl">
          DevMentor
        </h1>
        <p className="mx-auto mt-6 max-w-xl text-lg leading-8 text-zinc-600 dark:text-zinc-400">
          Portal, który pomaga rozwijać umiejętności programistyczne. Znajdź
          wiedzę, inspirację i wsparcie na każdym etapie swojej drogi w IT.
        </p>
      </section>
    </main>
  );
}
