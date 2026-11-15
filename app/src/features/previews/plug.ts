// A page's capture under a chat line: its slot, filled at the first screen with a few bytes that ask the capture's own code when a
// checked line links a page.
import { createElement, lazy, Suspense } from "react";
import { plug } from "../../slots.tsx";

const Preview = lazy(async () => ({ default: (await import("./Preview.tsx")).Preview }));

plug("linePreview", ({ path, tabbable }) =>
  createElement(Suspense, { fallback: null }, createElement(Preview, { path, look: "line", tabbable })),
);
