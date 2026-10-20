import { expect, test } from "vitest";
import { BACK_HOME, alertOf, render } from "../tests/render.tsx";
import { ErrorBoundary } from "./root.tsx";

test("an error no route catches shows an alert, never a blank page", async () => {
  const failing = () => {
    throw new Error("a bug");
  };
  const html = await render({ path: "/", loader: failing, ErrorBoundary }, "/");
  expect(html).toContain('role="alert"');
  expect(html).toContain("<h1>Something went wrong</h1>");
  expect(alertOf(html)).toMatch(BACK_HOME);
});
