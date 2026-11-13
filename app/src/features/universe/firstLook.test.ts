// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";

const still = vi.hoisted(() => ({ on: false }));
vi.mock("../../space/motion.ts", () => ({
  motionOf: () => ({
    get matches() {
      return still.on;
    },
  }),
}));

// While the loader stands, the home's dive is kept; once the first frame is drawn it starts as the bar's last 200 ms of fill ends (at once under
// reduced motion), and a dive that was never kept has nothing to start.
const loader = (): void => {
  const box = document.createElement("div");
  box.setAttribute("role", "status");
  box.setAttribute("aria-label", "Loading space");
  document.body.append(box);
};

afterEach(() => {
  still.on = false;
  document.body.replaceChildren();
  vi.resetModules();
});

it("keeps the home's dive while the loader stands and starts it 200 ms after the first frame", async () => {
  const { holdsDive, releaseDive } = await import("./firstLook.ts");
  loader();
  expect(holdsDive({ kind: "home" })).toBe(true);
  expect(holdsDive({ kind: "universe" })).toBe(false);
  expect(releaseDive()).toBe(200);
  expect(holdsDive({ kind: "home" })).toBe(false);
});

it("starts a kept dive at once under reduced motion, and keeps none where no loader stands", async () => {
  const { holdsDive, releaseDive } = await import("./firstLook.ts");
  expect(holdsDive({ kind: "home" })).toBe(false);
  expect(releaseDive()).toBeUndefined();
  vi.resetModules();
  const again = await import("./firstLook.ts");
  loader();
  still.on = true;
  expect(again.holdsDive({ kind: "home" })).toBe(true);
  expect(again.releaseDive()).toBe(0);
});

it("puts the scene's canvas out of the accessibility tree: a picture outside every landmark, its names being the buttons and the page's words", async () => {
  const { layers } = await import("./firstLook.ts");
  expect(layers("scene").canvas.getAttribute("aria-hidden")).toBe("true");
});
