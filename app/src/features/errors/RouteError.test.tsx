import { data } from "react-router";
import { describe, expect, test, vi } from "vitest";
import { alertOf, headingOf, render } from "../../../tests/render.tsx";
import { RouteError } from "./RouteError.tsx";
import { referenceOf, reloadOnce } from "./report.ts";
import { WORDS } from "./words.ts";
import type { ErrorKind } from "./kind.ts";

const boundedBy = (thrown: unknown, noun?: string) =>
  render(
    {
      path: "/",
      loader: () => {
        throw thrown;
      },
      ErrorBoundary: () => <RouteError {...(noun === undefined ? {} : { noun })} />,
    },
    "/",
    { slot: true },
  );

describe("the shared boundary shows each kind's words", () => {
  test.each<[ErrorKind, unknown]>([
    ["not-found", data(null, { status: 404 })],
    ["gone", data(null, { status: 410 })],
    ["forbidden", data(null, { status: 403 })],
    ["too-many", data(null, { status: 429 })],
    ["unavailable", data(null, { status: 503 })],
    ["new-version", new TypeError("error loading dynamically imported module")],
    ["crash", new Error("a bug")],
  ])("%s", async (kind, thrown) => {
    const html = await boundedBy(thrown, "world");
    expect(headingOf(html)).toBe(WORDS[kind].title("world"));
    expect(alertOf(html)).toContain(WORDS[kind].line("world"));
    expect(alertOf(html)).toContain("Galaxy");
  });

  test("a crash with no place says only that something went wrong", async () => {
    expect(headingOf(await boundedBy(new Error("a bug")))).toBe("Something went wrong");
  });

  test("a missing place offers the search first", async () => {
    expect(alertOf(await boundedBy(data(null, { status: 404 })))).toMatch(/href="\/#search"[^>]*>Search</);
  });
});

describe("a new version reloads once", () => {
  test("the first time only, and never where the mark cannot be kept", () => {
    const kept = new Map<string, string>();
    const storage = {
      getItem: (k: string) => kept.get(k) ?? null,
      setItem: (k: string, v: string) => void kept.set(k, v),
    };
    const reload = vi.fn();
    expect(reloadOnce(storage, reload)).toBe(true);
    expect(reloadOnce(storage, reload)).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
    const blocked = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => undefined,
    };
    expect(reloadOnce(blocked, reload)).toBe(false);
    expect(reloadOnce(undefined, reload)).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });
});

test("a reference holds the time and the route, nothing else", () => {
  expect(referenceOf(new Date("2026-11-12T10:20:30.456Z"), "/w/bubble")).toBe("2026-11-12T10:20:30Z /w/bubble");
});
