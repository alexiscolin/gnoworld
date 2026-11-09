// node --test tests/e2e/crowd.test.mjs: the crowd refuses every base that is not the workshop's own machine.
import assert from "node:assert/strict";
import { test } from "node:test";
import { parse } from "./crowd.mjs";

test("refuses any base but 127.0.0.1 or localhost", () => {
  for (const base of [
    "https://gnoworld.example",
    "http://10.0.0.5:5198",
    "http://127.0.0.1.evil.com",
    "http://localhost@evil.com",
    "https://127.0.0.1",
  ])
    assert.throws(() => parse(["--base", base]), /only the workshop/, base);
  assert.equal(parse([]).base, "http://127.0.0.1:5198");
  assert.equal(parse(["--base", "http://localhost:5198", "--people", "3"]).writers, 3);
});
