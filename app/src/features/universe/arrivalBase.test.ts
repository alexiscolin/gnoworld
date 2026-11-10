import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { EMPHASIZED, LABEL_MS } from "./arrivalBase.ts";

// The motion constants GSAP and the frame loop cannot read from CSS stand for these tokens: they change together.
const tokens = readFileSync(new URL("../../../../packages/ui/src/tokens.css", import.meta.url), "utf8");

test("the label fade is tokens.css's --motion-label", () => {
  expect(tokens).toContain(`--motion-label: ${String(LABEL_MS)}ms;`);
});

test("the emphasized ease is tokens.css's --ease-emphasized", () => {
  const [x1, y1, x2, y2] = [0.7, 0, 0.2, 1];
  expect(tokens).toContain(
    `--ease-emphasized: cubic-bezier(${String(x1)}, ${String(y1)}, ${String(x2)}, ${String(y2)});`,
  );
  expect(EMPHASIZED(0)).toBeCloseTo(0, 5);
  expect(EMPHASIZED(1)).toBeCloseTo(1, 5);
});
