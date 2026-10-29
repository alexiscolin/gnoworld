import type { RouteObject } from "react-router";
import { describe, expect, test } from "vitest";
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
