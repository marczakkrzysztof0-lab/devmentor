import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { StorybookConfig } from "@storybook/react-vite";
import tailwindcss from "@tailwindcss/vite";
import remarkGfm from "remark-gfm";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
// Local Geist files (P3): no CDN. `geist` exports only ./font/*, so resolve dist/ from it.
// npm workspaces keep these packages in packages/ui/node_modules while `storybook` is hoisted,
// so addons and the framework are passed as absolute paths (Storybook monorepo pattern).
const abs = (pkg: string) => path.dirname(require.resolve(path.join(pkg, "package.json")));
const geistFonts = path.join(path.dirname(require.resolve("geist/font/sans")), "fonts");

const config: StorybookConfig = {
  stories: ["../docs/**/*.mdx", "../docs/**/*.stories.@(ts|tsx)", "../src/**/*.mdx", "../src/**/*.stories.@(ts|tsx)"],
  addons: [
    {
      name: abs("@storybook/addon-docs"),
      // Rule 8: GitHub-flavoured tables in MDX.
      options: { mdxPluginOptions: { mdxCompileOptions: { remarkPlugins: [remarkGfm] } } },
    },
    abs("@storybook/addon-a11y"),
    abs("@storybook/addon-vitest"),
  ],
  // P9: the product favicon (copy of app/favicon.ico) instead of the Storybook logo.
  staticDirs: ["./public"],
  framework: { name: abs("@storybook/react-vite") as "@storybook/react-vite", options: {} },
  core: {
    disableTelemetry: true,
    disableWhatsNewNotifications: true, // rule 10
  },
  features: {
    sidebarOnboardingChecklist: false, // rule 10
    menuOnboardingChecklist: false,
  },
  async viteFinal(viteConfig) {
    const { mergeConfig } = await import("vite");
    return mergeConfig(viteConfig, {
      plugins: [tailwindcss()],
      // Pre-bundle the component dependencies, so the first test run does not reload mid-run.
      optimizeDeps: { include: ["radix-ui", "lucide-react", "class-variance-authority", "tailwind-merge", "clsx", "react-dom/server"] },
      resolve: { alias: { "@geist-fonts": geistFonts, "@devmentor/ui": path.join(dirname, "../src/index.ts") } },
    });
  },
};

export default config;
