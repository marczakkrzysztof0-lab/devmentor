import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import storybook from "eslint-plugin-storybook";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Stories in the design system package (packages/ui).
  ...storybook.configs["flat/recommended"],
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Built Storybook (packages/ui):
    "**/storybook-static/**",
    // Lesson 07: copied grey prototype and lesson materials:
    "packages/ui/.storybook/public/prototypes/**",
    "lekcja-07/**",
  ]),
]);

export default eslintConfig;
