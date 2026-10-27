// Lokalny scheduler zadań `npm run jobs` (spec #24 Q9; scripts/jobs.mjs).
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseJobsArgs, triggerJobs, DEFAULT_INTERVAL_SECONDS } from "../scripts/jobs.mjs";

test("domyślny adres to http://localhost:3000/api/internal/jobs, co 60 s, bez --once", () => {
  assert.deepEqual(parseJobsArgs([], {}), {
    url: "http://localhost:3000/api/internal/jobs",
    once: false,
    intervalMs: DEFAULT_INTERVAL_SECONDS * 1000,
  });
});

test("--url wygrywa z NEXT_PUBLIC_APP_URL; końcowe ukośniki są obcinane", () => {
  const env = { NEXT_PUBLIC_APP_URL: "https://z-env.example/" };
  assert.equal(parseJobsArgs(["--url", "http://localhost:4000//"], env).url, "http://localhost:4000/api/internal/jobs");
  assert.equal(parseJobsArgs([], env).url, "https://z-env.example/api/internal/jobs");
});

test("--once włącza pojedyncze wywołanie", () => {
  assert.equal(parseJobsArgs(["--once"], {}).once, true);
});

test("--interval ustawia odstęp w sekundach; zła wartość wraca do domyślnej", () => {
  assert.equal(parseJobsArgs(["--interval", "5"], {}).intervalMs, 5000);
  for (const value of ["0", "-3", "abc"]) {
    assert.equal(parseJobsArgs(["--interval", value], {}).intervalMs, DEFAULT_INTERVAL_SECONDS * 1000, value);
  }
});

function fakeFetch(body, status = 200) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return { status, text: async () => body };
  };
  return { calls, fetchImpl };
}

test("triggerJobs wysyła POST z nagłówkiem Authorization: Bearer <sekret> i zwraca JSON", async () => {
  const { calls, fetchImpl } = fakeFetch(JSON.stringify({ ok: true, jobs: 3 }));
  const result = await triggerJobs({ url: "http://localhost:3000/api/internal/jobs", secret: "SEKRET_PLACEHOLDER", fetchImpl });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "http://localhost:3000/api/internal/jobs");
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.headers.authorization, "Bearer SEKRET_PLACEHOLDER");
  assert.deepEqual(result, { status: 200, body: { ok: true, jobs: 3 } });
});

test("triggerJobs: odpowiedź niebędąca JSON-em wraca jako tekst, status jest przekazany", async () => {
  const { fetchImpl } = fakeFetch("Unauthorized", 401);
  const result = await triggerJobs({ url: "http://localhost:3000/x", secret: "SEKRET_PLACEHOLDER", fetchImpl });
  assert.deepEqual(result, { status: 401, body: "Unauthorized" });
  assert.ok(!JSON.stringify(result).includes("SEKRET_PLACEHOLDER"));
});
