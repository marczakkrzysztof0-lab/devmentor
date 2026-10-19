// Storybook-only helpers: measure WCAG 2.x contrast from the CSS variables the browser
// actually resolves (not from numbers copied into the docs).

export type Theme = "light" | "dark";

export type Pair = {
  fg: string; // semantic token, without the --ds- prefix
  bg: string;
  kind: "text" | "ui" | "decorative";
  note?: string;
};

/** Every colour pair the components use (lekcja-06/tokeny.md, "Pary kolorów i kontrast"). */
export const PAIRS: Pair[] = [
  { fg: "text-primary", bg: "surface-page", kind: "text" },
  { fg: "text-primary", bg: "surface-panel", kind: "text" },
  { fg: "text-primary", bg: "surface-code", kind: "text" },
  { fg: "text-muted", bg: "surface-page", kind: "text" },
  { fg: "text-muted", bg: "surface-panel", kind: "text" },
  { fg: "text-muted", bg: "surface-code", kind: "text" },
  { fg: "text-on-action", bg: "action-primary-fill", kind: "text" },
  { fg: "text-on-action", bg: "action-primary-fill-hover", kind: "text" },
  { fg: "text-link", bg: "surface-page", kind: "text" },
  { fg: "text-link", bg: "surface-panel", kind: "text" },
  { fg: "text-link", bg: "surface-code", kind: "text" },
  { fg: "status-success-text", bg: "surface-page", kind: "text" },
  { fg: "status-success-text", bg: "surface-panel", kind: "text" },
  { fg: "status-danger-text", bg: "surface-page", kind: "text" },
  { fg: "status-danger-text", bg: "surface-panel", kind: "text" },
  { fg: "border-control", bg: "surface-page", kind: "ui" },
  { fg: "border-control", bg: "surface-panel", kind: "ui" },
  { fg: "border-control", bg: "surface-code", kind: "ui", note: "read-only field (T1)" },
  { fg: "action-primary-fill", bg: "surface-page", kind: "ui", note: "button edge" },
  { fg: "focus-ring", bg: "surface-page", kind: "ui" },
  { fg: "focus-ring", bg: "surface-panel", kind: "ui" },
  { fg: "focus-ring", bg: "surface-code", kind: "ui", note: "focus on code blocks (T1)" },
  {
    fg: "border-divider",
    bg: "surface-page",
    kind: "decorative",
    note: "row separator only; never a field edge or a state signal",
  },
];

export const THRESHOLD: Record<Pair["kind"], number | null> = { text: 4.5, ui: 3, decorative: null };

type Rgb = [number, number, number];

function parseColor(value: string): Rgb {
  const nums = value.match(/[\d.]+/g)?.map(Number) ?? [];
  // Chromium returns rgb(r, g, b) or color(srgb r g b) with 0–1 channels. // check-tokens-ignore: parses the browser output
  if (value.startsWith("color(")) return [nums[0] * 255, nums[1] * 255, nums[2] * 255]; // check-tokens-ignore
  return [nums[0], nums[1], nums[2]];
}

function luminance([r, g, b]: Rgb) {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function ratio(a: Rgb, b: Rgb) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Resolves a semantic colour token in a theme by painting a probe element. */
export function resolveToken(token: string, theme: Theme): { css: string; rgb: Rgb } {
  const probe = document.createElement("div");
  probe.dataset.theme = theme;
  probe.style.color = `var(--ds-${token})`;
  probe.style.position = "absolute";
  probe.style.visibility = "hidden";
  document.body.appendChild(probe);
  const css = getComputedStyle(probe).color;
  probe.remove();
  return { css, rgb: parseColor(css) };
}

export type Measured = Pair & { theme: Theme; ratio: number; pass: boolean | null };

export function measureAll(): Measured[] {
  const out: Measured[] = [];
  for (const theme of ["light", "dark"] as const) {
    for (const pair of PAIRS) {
      const r = ratio(resolveToken(pair.fg, theme).rgb, resolveToken(pair.bg, theme).rgb);
      const min = THRESHOLD[pair.kind];
      out.push({ ...pair, theme, ratio: r, pass: min === null ? null : r >= min });
    }
  }
  return out;
}
