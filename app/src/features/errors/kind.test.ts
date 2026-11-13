import { describe, expect, test } from "vitest";
import { errorKind, isMissing, type ErrorKind } from "./kind.ts";

// What the router hands a boundary for a loader's `data(null, { status })`.
const status = (code: number) => ({ status: code, statusText: "", internal: false, data: null });

describe("errorKind", () => {
  test.each<[string, unknown, ErrorKind]>([
    ["a 404", status(404), "not-found"],
    ["a 410", status(410), "gone"],
    ["a 401", status(401), "forbidden"],
    ["a 403", status(403), "forbidden"],
    ["a 429", status(429), "too-many"],
    ["a 502", status(502), "unavailable"],
    ["a 503", status(503), "unavailable"],
    ["a 504", status(504), "unavailable"],
    ["a 500", status(500), "crash"],
    ["a failed read's status", { status: 503 }, "unavailable"],
    [
      "a chunk that did not load (Chromium)",
      new TypeError("Failed to fetch dynamically imported module: /a.js"),
      "new-version",
    ],
    ["a chunk that did not load (Firefox)", new TypeError("error loading dynamically imported module"), "new-version"],
    ["a chunk that did not load (Safari)", new TypeError("Importing a module script failed."), "new-version"],
    ["a fetch that never reached its server", new TypeError("Failed to fetch"), "offline"],
    ["a fetch that never reached its server (Safari)", new TypeError("Load failed"), "offline"],
    ["a bug", new Error("a bug"), "crash"],
    ["a thrown string", "oops", "crash"],
  ])("%s is %s", (_, error, kind) => {
    expect(errorKind(error, true)).toBe(kind);
  });

  test("a browser with no network is offline, whatever failed, a chunk included", () => {
    expect(errorKind(new Error("a bug"), false)).toBe("offline");
    expect(errorKind(new TypeError("error loading dynamically imported module"), false)).toBe("offline");
  });

  test("only a 404 is missing", () => {
    expect(isMissing(status(404))).toBe(true);
    expect(isMissing(status(410))).toBe(false);
    expect(isMissing(new Error("x"))).toBe(false);
  });
});
