import { describe, expect, test } from "vitest";
import { render } from "../../tests/render.tsx";
import { notFoundMeta } from "../site.ts";
import { clientLoader, ErrorBoundary, meta } from "./notFound.tsx";

describe("a path no route matches", () => {
  test("shows not found, as an alert", async () => {
    const html = await render({ path: "*", loader: clientLoader, ErrorBoundary }, "/nowhere");
    expect(html).toContain('role="alert"');
    expect(html).toContain("<h1>No page here</h1>");
    expect(html).toContain("<p>Nothing on gno.world goes by this address.</p>");
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
