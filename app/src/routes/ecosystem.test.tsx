import type { RouteObject } from "react-router";
import { describe, expect, test, vi } from "vitest";
import { render } from "../../tests/render.tsx";

import Ecosystem, { clientLoader as loader, ErrorBoundary } from "./ecosystem.tsx";

const route = (path: string): RouteObject => ({ path, Component: Ecosystem, loader, ErrorBoundary });

// app/data/ecosystems.json holds none today: no invented page for a name the data does not hold.
describe("an ecosystem's page", () => {
  test.each([
    ["/e/:ecosystem", "/e/tokens"],
    ["/e/:ecosystem", "/e/Tokens"],
    ["/net/:network/e/:ecosystem", "/net/onyx/e/tokens"],
  ])("%s at %s is not found while the data holds none, as an alert", async (pattern, path) => {
    const html = await render(route(pattern), path);
    expect(html).toContain('role="alert"');
    expect(html).toMatch(/No ecosystem/i);
  });
});

describe("an ecosystem's page on a phone", () => {
  test("its loader sends the phone to the universe's home, before reading the data", () => {
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: query === "(max-width: 899px)" }));
    try {
      const sent = loader({ request: new Request("http://x/e/tokens") });
      expect(sent).toBeInstanceOf(Response);
      expect(sent instanceof Response ? sent.headers.get("location") : undefined).toBe("/");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
