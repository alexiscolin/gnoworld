import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { PRODUCTION, UpdateNotice, UpdatePrompt } from "./UpdatePrompt.tsx";

// The words a page says, its markup taken off.
const said = (html: string) => html.replaceAll(/<[^>]+>/g, "");

test("the worker registers only in a production build: the flag comes from the build, and Vitest's is not one", () => {
  expect(PRODUCTION).toBe(false);
});

test("before any update, the pre-rendered page holds the status region, empty: what fills it later is announced", () => {
  const html = renderToStaticMarkup(<UpdatePrompt />);
  expect(html.match(/role="status"/g)).toHaveLength(1);
  expect(said(html)).toBe("");
  expect(html).not.toContain("<button");
  expect(html).not.toContain("<svg");
});

test("an update is announced politely, with one button that reloads", () => {
  const html = renderToStaticMarkup(<UpdateNotice onReload={() => undefined} onClose={() => undefined} />);
  expect(html.match(/role="status"/g)).toHaveLength(1);
  expect(said(html)).toContain("New version available.");
  expect(html.match(/<button[^>]*>Reload<\/button>/g)).toHaveLength(1);
});
