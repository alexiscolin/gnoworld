import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { PRODUCTION, UpdateNotice, UpdatePrompt } from "./UpdatePrompt.tsx";

test("the worker registers only in a production build: the flag comes from the build, and Vitest's is not one", () => {
  expect(PRODUCTION).toBe(false);
});

test("before any update, the prompt shows nothing: the pre-rendered page holds no notice", () => {
  expect(renderToStaticMarkup(<UpdatePrompt />)).toBe("");
});

test("an update is announced politely, with one button that reloads", () => {
  const html = renderToStaticMarkup(<UpdateNotice onReload={() => undefined} />);
  expect(html).toContain('role="status"');
  expect(html).toContain("New version available.");
  expect(html.match(/<button[^>]*>Reload<\/button>/g)).toHaveLength(1);
  expect(html).toContain('type="button"');
});
