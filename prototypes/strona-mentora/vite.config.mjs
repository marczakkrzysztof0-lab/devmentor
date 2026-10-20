// Prototyp „strona-mentora”: React + Vite + Tailwind 4, komponenty z @devmentor/ui (źródła w packages/ui/src).
// Wynik budowania trafia do statycznego katalogu Storybooka (gitignore) i otwiera się pod
// /prototypes/strona-mentora/index.html.
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../..");
const ui = path.join(repo, "packages/ui");
// Zależności narzędziowe leżą w packages/ui/node_modules (npm workspaces), więc rozwiązujemy je stamtąd.
const requireFromUi = createRequire(path.join(ui, "package.json"));
const { default: tailwindcss } = await import(pathToFileURL(requireFromUi.resolve("@tailwindcss/vite")).href);
const geistFonts = path.join(path.dirname(requireFromUi.resolve("geist/font/sans")), "fonts");

const config = {
  root: here,
  base: "./",
  oxc: { jsx: { runtime: "automatic" } },
  plugins: [tailwindcss()],
  resolve: {
    alias: {
      "@devmentor/ui/product": path.join(ui, "src/product/index.ts"),
      "@devmentor/ui/styles.css": path.join(ui, "src/styles/index.css"),
      "@devmentor/ui": path.join(ui, "src/index.ts"),
      "@geist-fonts": geistFonts,
    },
    dedupe: ["react", "react-dom"],
  },
  server: { port: 5180, fs: { allow: [repo] } },
  build: {
    outDir: path.join(ui, ".storybook/public/prototypes/strona-mentora"),
    emptyOutDir: true,
    rollupOptions: {
      // Dyrektywy "use client" z komponentów DS i Radix nie mają znaczenia poza Next.js.
      onwarn(warning, warn) {
        if (warning.code !== "MODULE_LEVEL_DIRECTIVE") warn(warning);
      },
    },
  },
};

export default config;
