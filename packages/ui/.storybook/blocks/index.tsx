// Storybook-only documentation blocks (rule 5 exception): they render the real CSS
// variables of the design system and are never exported from @devmentor/ui.
import { useEffect, useState, type ReactNode } from "react";

/** Reads the DOM after paint (the CSS variables are an external system for React). */
function useMeasured<T>(read: () => T, initial: T, deps: unknown[]): T {
  const [value, setValue] = useState(initial);
  useEffect(() => {
    const id = requestAnimationFrame(() => setValue(read()));
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return value;
}

import { measureAll, resolveToken, type Measured, type Theme } from "./contrast";

/** Wraps a live preview so it uses the product's tokens, not the docs theme. */
export function Preview({ children, theme }: { children: ReactNode; theme?: Theme }) {
  return (
    <div
      data-theme={theme}
      className="ds-docs-preview rounded-control border border-divider p-inside-panel"
    >
      {children}
    </div>
  );
}

const fmt = (n: number) => n.toFixed(2).replace(".", ",");

export function ContrastTable() {
  const rows = useMeasured<Measured[]>(measureAll, [], []);
  const byPair = new Map<string, { light?: Measured; dark?: Measured }>();
  for (const row of rows) {
    const key = `${row.fg} / ${row.bg}`;
    byPair.set(key, { ...byPair.get(key), [row.theme]: row });
  }
  const verdict = (m?: Measured) =>
    !m ? "…" : m.pass === null ? `${fmt(m.ratio)} (decorative)` : `${fmt(m.ratio)} ${m.pass ? "pass" : "FAIL"}`;
  return (
    <div className="ds-docs-preview">
      <table data-testid="contrast-table" className="w-full text-meta">
        <caption className="text-left text-muted pb-in-group">
          Measured in this browser from the CSS variables of both themes (WCAG 2.x relative luminance).
        </caption>
        <thead>
          <tr className="text-left">
            <th scope="col" className="py-in-group">Foreground / background</th>
            <th scope="col">Kind</th>
            <th scope="col">Minimum</th>
            <th scope="col">Light</th>
            <th scope="col">Dark</th>
          </tr>
        </thead>
        <tbody>
          {[...byPair.entries()].map(([key, { light, dark }]) => (
            <tr key={key} className="border-t border-divider">
              <th scope="row" className="py-in-group text-left font-mono font-regular">
                {key}
                {light?.note ? <span className="block font-ui text-muted">{light.note}</span> : null}
              </th>
              <td>{light?.kind}</td>
              <td>{light?.kind === "text" ? "4,5 : 1" : light?.kind === "ui" ? "3 : 1" : "—"}</td>
              <td data-result={light?.pass === false ? "fail" : "ok"}>{verdict(light)}</td>
              <td data-result={dark?.pass === false ? "fail" : "ok"}>{verdict(dark)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Swatch row for one semantic colour token, showing its resolved value per theme. */
export function ColorTokens({ tokens }: { tokens: { name: string; use: string; source: string }[] }) {
  const values = useMeasured<Record<string, { light: string; dark: string }>>(
    () =>
      Object.fromEntries(
        tokens.map((t) => [t.name, { light: resolveToken(t.name, "light").css, dark: resolveToken(t.name, "dark").css }]),
      ),
    {},
    [tokens],
  );
  return (
    <div className="ds-docs-preview">
      <table className="w-full text-meta">
        <thead>
          <tr className="text-left">
            <th scope="col" className="py-in-group">Token</th>
            <th scope="col">Light</th>
            <th scope="col">Dark</th>
            <th scope="col">Use for</th>
            <th scope="col">Source</th>
          </tr>
        </thead>
        <tbody>
          {tokens.map((t) => (
            <tr key={t.name} className="border-t border-divider align-top">
              <th scope="row" className="py-in-group text-left font-mono font-regular">
                --ds-{t.name}
              </th>
              {(["light", "dark"] as const).map((theme) => (
                <td key={theme} className="py-in-group">
                  <span className="flex items-center gap-in-group">
                    <span
                      aria-hidden="true"
                      data-theme={theme}
                      className="inline-block size-between-groups rounded-control border border-control"
                      style={{ background: `var(--ds-${t.name})` }}
                    />
                    <span className="font-mono">{values[t.name]?.[theme] ?? "…"}</span>
                  </span>
                </td>
              ))}
              <td className="py-in-group">{t.use}</td>
              <td className="py-in-group">{t.source}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Shows a CSS variable's current computed value next to its name. */
export function TokenValue({ name }: { name: string }) {
  const value = useMeasured(
    () => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "(unset)",
    "…",
    [name],
  );
  return <code>{value}</code>;
}
