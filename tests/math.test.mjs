import { test } from "node:test";
import assert from "node:assert/strict";
import { add } from "../lib/math.mjs";

test("add sums two numbers", () => {
  assert.equal(add(2, 2), 4);
});
