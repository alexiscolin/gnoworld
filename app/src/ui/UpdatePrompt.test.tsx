import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { PRODUCTION, UpdateNotice, UpdatePrompt } from "./UpdatePrompt.tsx";

test("the worker registers only in a production build: the flag comes from the build, and Vitest's is not one", () => {
  expect(PRODUCTION).toBe(false);
});

test("before any update, the pre-rendered page holds the status region, empty: what fills it later is announced", () => {
  expect(renderToStaticMarkup(<UpdatePrompt />)).toBe('<div role="status"></div>');
});

test("an update is announced politely, with one button that reloads", () => {
  expect(renderToStaticMarkup(<UpdateNotice onReload={() => undefined} />)).toBe(
    '<div role="status">New version available. <button type="button">Reload</button></div>',
  );
});
