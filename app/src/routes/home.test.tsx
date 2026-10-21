import { expect, test } from "vitest";
import { BACK_HOME, alertOf, render } from "../../tests/render.tsx";
import Home, { ErrorBoundary } from "./home.tsx";

test("home links to each world by its name, at the world's path", async () => {
  const html = await render({ path: "/", Component: Home }, "/");
  expect(html).toContain("<h1>gno.world</h1>");
  expect(html).toContain('<a href="/w/bubble"');
  expect(html).toContain(">Bubble</a>");
});

const failing = {
  path: "/",
  Component: Home,
  loader: () => {
    throw new Error("the chain did not answer");
  },
  ErrorBoundary,
};

// Every route catches its own errors (docs/ARCHITECTURE.md; F329).
test("home shows its own alert when it fails, with a way home", async () => {
  const html = await render(failing, "/");
  expect(html).toContain('role="alert"');
  expect(alertOf(html)).toMatch(BACK_HOME);
});

// The app may be what failed: the way home loads the document again (F325).
test("home's way out of a failure loads the document again", async () => {
  expect(alertOf(await render(failing, "/", { slot: true }))).not.toContain("data-routed");
});
