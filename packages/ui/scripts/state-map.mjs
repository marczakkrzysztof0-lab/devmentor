// Generates the screen state-map pages (which story shows which screen state) from storybook-static/index.json.
// Usage: npm run build-storybook && npm run state-map
import fs from "node:fs";
const idx = JSON.parse(fs.readFileSync("storybook-static/index.json", "utf8"));
const screens = {
  S1: ["/invite/[token]", "#14"], S2: ["/sign-in/[token]", "#14"], S3: ["/mentor (no session)", "#14"],
  S4: ["/mentor", "#14, #15"], S5: ["/mentor/availability", "#15"], S6: ["/m/[slug]", "#16, #17"],
  S7: ["/r/[token]", "#17, #18, #19"], S8: ["/mentor/requests", "#18"], S9: ["/mentor/requests/[id]", "#18"],
};
const gen = (epicTitle, file, title, intro) => {
  const rows = Object.values(idx.entries).filter((e) => e.type === "story" && e.title === epicTitle);
  let out = `import { Meta } from "@storybook/addon-docs/blocks";\n\n<Meta title="${title}" />\n\n# ${title.split("/").slice(-2).join(" – ")}\n\n${intro}\n\n<table>\n  <thead>\n    <tr><th scope="col">Screen</th><th scope="col">Route</th><th scope="col">Spec</th><th scope="col">State</th><th scope="col">Story</th></tr>\n  </thead>\n  <tbody>\n`;
  for (const e of rows) {
    const [screen, rest] = e.name.split(" · ");
    const code = screen.split(" ")[0];
    const [route, spec] = screens[code];
    out += `    <tr><td>${screen}</td><td><code>${route}</code></td><td>${spec}</td><td>${rest}</td><td><a href="./?path=/story/${e.id}" target="_top">${e.id.split("--")[1]}</a></td></tr>\n`;
  }
  out += `  </tbody>\n</table>\n`;
  fs.writeFileSync(file, out);
  return rows.length;
};
console.log(gen("Product/E01 Mentor page/Screens", "src/product/screens/E01StateMap.mdx", "Product/E01 Mentor page/Screens state map",
  "Which story shows which state of each E01 screen. Every story is full screen and uses only components from `@devmentor/ui` and `@devmentor/ui/product` with spec data. Generated from the built Storybook index by `npm run state-map` (run `build-storybook` first); regenerate when adding a screen story."));
console.log(gen("Product/E02 Paid request/Screens", "src/product/screens/E02StateMap.mdx", "Product/E02 Paid request/Screens state map",
  "Which story shows which state of each E02 screen. S6 (`/m/[slug]`) belongs to both epics: #16 builds the page, #17 adds the request form, so it is shown with the form."));
