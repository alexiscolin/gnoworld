import { readFileSync } from "node:fs";
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

// The app links layers.css first on every page (F3260); styles.css, which the stories load alone, says the same order.
test("layers.css and styles.css of the design system declare the same layers in the same order", () => {
  const statement = (file: string) => /@layer\s+[\w\s,]+;/.exec(readFileSync(`packages/ui/src/${file}`, "utf8"))?.[0];
  expect(statement("layers.css")).toBeDefined();
  expect(statement("layers.css")).toBe(statement("styles.css"));
});
