import "./preview.css";

import type { Decorator, Preview } from "@storybook/react-vite";
import { GLOBALS_UPDATED, SET_GLOBALS } from "storybook/internal/core-events";
import { addons } from "storybook/preview-api";

import { applyTheme, type ThemeChoice } from "./theme";

// `npm run test:themes` runs every story once per theme through this variable.
const initialTheme = (import.meta.env.VITE_SB_THEME as ThemeChoice | undefined) ?? "light";
applyTheme(initialTheme);

// MDX pages have no story decorator, so follow the toolbar through the channel as well.
const channel = addons.getChannel();
const onGlobals = ({ globals }: { globals: Record<string, unknown> }) =>
  applyTheme(globals.theme as ThemeChoice | undefined);
channel.on(SET_GLOBALS, onGlobals);
channel.on(GLOBALS_UPDATED, onGlobals);

const withTheme: Decorator = (Story, context) => {
  applyTheme(context.globals.theme as ThemeChoice | undefined);
  return <Story />;
};

const preview: Preview = {
  globalTypes: {
    theme: {
      description: "Colour theme (set on <html data-theme>)",
      toolbar: {
        title: "Theme",
        icon: "mirror",
        items: [
          { value: "light", title: "Light" },
          { value: "dark", title: "Dark" },
          { value: "system", title: "System (prefers-color-scheme)" },
        ],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: { theme: initialTheme },
  decorators: [withTheme],
  parameters: {
    layout: "padded",
    controls: { expanded: true },
    backgrounds: { disable: true },
    a11y: { test: "error" },
    options: {
      storySort: {
        order: [
          "Start here",
          "Components",
          "How to choose",
          "Usage and accessibility",
          "Content",
          "What to avoid",
          "What is missing",
          "Contributing",
          "Epics",
          "Foundations",
          ["Color", "Typography", "Spacing and layout", "Shape and depth", "Motion", "Icons", "Themes"],
          "Primitives",
          "Product",
          "Patterns",
        ],
      },
    },
  },
};

export default preview;
