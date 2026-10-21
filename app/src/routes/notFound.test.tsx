import { describe, expect, test } from "vitest";
import { BACK_HOME, alertOf, render } from "../../tests/render.tsx";
import { notFoundMeta } from "../meta.ts";
import { clientLoader, ErrorBoundary, meta } from "./notFound.tsx";

describe("a path no route matches", () => {
  test("shows not found, as an alert", async () => {
    const html = await render({ path: "*", loader: clientLoader, ErrorBoundary }, "/nowhere");
    expect(html).toContain('role="alert"');
    expect(html).toContain("<h1>No page here</h1>");
    expect(html).toContain("<p>Nothing on gno.world goes by this address.</p>");
    expect(alertOf(html)).toMatch(BACK_HOME);
  });

  // Nothing broke: the way home changes the page and keeps the app (F259; F325 keeps it so).
  test("goes home through the router", async () => {
    const html = await render({ path: "*", loader: clientLoader, ErrorBoundary }, "/nowhere", { slot: true });
    expect(alertOf(html)).toContain('data-routed=""');
  });

  test("answers 404 in the browser, so the router waits before it hydrates", () => {
    let thrown: unknown;
    try {
      clientLoader();
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toMatchObject({ init: { status: 404 } });
  });

  test("carries the not-found tags", () => {
    expect(meta()).toEqual(notFoundMeta());
  });
});
