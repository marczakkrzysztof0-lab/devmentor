// Runs every story test (render, play, axe) once in the light and once in the dark theme.
// Exit code 1 if either run fails. Usage: npm run test:themes
import { spawnSync } from "node:child_process";

let failed = false;
for (const theme of ["light", "dark"]) {
  console.log(`\n=== Storybook tests: ${theme} theme ===`);
  const result = spawnSync("npx", ["vitest", "run", "--project=storybook"], {
    stdio: "inherit",
    shell: process.platform === "win32",
    env: { ...process.env, VITE_SB_THEME: theme },
  });
  if (result.status !== 0) failed = true;
}
process.exit(failed ? 1 : 0);
