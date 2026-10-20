// Mały serwer statyczny dla zbudowanego prototypu (testy i zrzuty). Bez zależności.
// Serwuje katalog statyczny Storybooka, więc adres jest taki sam jak w Storybooku:
// http://localhost:<port>/prototypes/strona-mentora/index.html
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const STATIC_ROOT = path.resolve(here, "../../../packages/ui/.storybook/public");
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".woff2": "font/woff2", ".ico": "image/x-icon", ".json": "application/json", ".svg": "image/svg+xml" };

export function serve(port = 0) {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const file = path.join(STATIC_ROOT, decodeURIComponent(url.pathname));
    if (!file.startsWith(STATIC_ROOT)) return res.writeHead(403).end();
    try {
      const body = await readFile(file);
      res.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream" }).end(body);
    } catch {
      res.writeHead(404).end("not found");
    }
  });
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve({ server, url: `http://127.0.0.1:${server.address().port}/prototypes/strona-mentora/index.html` })));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { url } = await serve(Number(process.env.PORT ?? 5181));
  console.log(`Prototyp: ${url}`);
}
