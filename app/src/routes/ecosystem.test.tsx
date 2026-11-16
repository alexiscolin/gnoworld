import type { RouteObject } from "react-router";
import { describe, expect, test, vi } from "vitest";
import { render } from "../../tests/render.tsx";
const phone = vi.hoisted(() => ({ goes: false }));
vi.mock("../features/chat/phoneGo.ts", () => ({ usePhoneGo: () => phone.goes }));

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
  test("draws nothing while the phone is sent home", async () => {
    // No loader: the page itself is what draws, as the build's fallback does.
    const page: RouteObject = { path: "/e/:ecosystem", Component: Ecosystem };
    expect(await render(page, "/e/tokens")).toContain('role="alert"');
    phone.goes = true;
    const html = await render(page, "/e/tokens");
    phone.goes = false;
    expect(html).not.toContain('role="alert"');
    expect(html).not.toMatch(/No ecosystem/i);
  });
});
