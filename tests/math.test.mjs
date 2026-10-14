import { test } from "node:test";
import assert from "node:assert/strict";
import { add } from "../lib/math.mjs";

test("add sums two numbers", () => {
  // Intentionally broken to verify that CI fails on a red test.
  assert.equal(add(2, 2), 5);
});
