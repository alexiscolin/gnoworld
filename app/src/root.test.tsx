import { expect, test } from "vitest";
import { BACK_HOME, alertOf, render } from "../tests/render.tsx";
import { ErrorBoundary } from "./root.tsx";

const failing = () => {
  throw new Error("a bug");
};

test("an error no route catches shows an alert, never a blank page", async () => {
  const html = await render({ path: "/", loader: failing, ErrorBoundary }, "/");
  expect(html).toContain('role="alert"');
  expect(html).toContain("<h1>Something went wrong</h1>");
  expect(alertOf(html)).toMatch(BACK_HOME);
});

// The app may be what failed: the way home loads the document again, which the router cannot (F325).
test("an error no route catches offers a way home that loads the document again", async () => {
  const html = await render({ path: "/", loader: failing, ErrorBoundary }, "/", { slot: true });
  expect(alertOf(html)).toMatch(BACK_HOME);
  expect(alertOf(html)).not.toContain("data-routed");
});
