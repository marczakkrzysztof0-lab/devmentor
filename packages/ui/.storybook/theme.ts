export type ThemeChoice = "light" | "dark" | "system";

/** Rule 9: the theme lives on <html>, so portals (dialogs, menus) get it too. */
export function applyTheme(theme: ThemeChoice | undefined) {
  const root = document.documentElement;
  if (!theme || theme === "system") {
    delete root.dataset.theme;
  } else {
    root.dataset.theme = theme;
  }
}
