import { describe, expect, it } from "vitest";
import { pulse } from "./pulse.ts";
import { wakeOn } from "./wakes.ts";

class Counted extends EventTarget {
  live = 0;
  override addEventListener(...args: Parameters<EventTarget["addEventListener"]>): void {
    this.live += 1;
    const [type, listener, options] = args;
    super.addEventListener(type, listener, options);
    if (typeof options === "object" && options.signal !== undefined)
      options.signal.addEventListener("abort", () => (this.live -= 1));
  }
}

function sleeper() {
  const [page, window, leaving] = [new Counted(), new Counted(), new AbortController()];
  let asked = 0;
  const wake = pulse(
    () => false,
    leaving.signal,
    (step) => {
      asked += 1;
      queueMicrotask(() => {
        step(0);
      });
    },
  );
  wakeOn({ page, window }, { input: wake, change: wake }, leaving.signal);
  return { page, window, leaving, asked: () => asked };
}

describe("wakeOn", () => {
  it.each(["pointermove", "pointerdown", "wheel", "keydown", "touchstart", "visibilitychange"])(
    "wakes a sleeping loop on the page's %s",
    async (type) => {
      const s = sleeper();
      await Promise.resolve();
      const before = s.asked();
      s.page.dispatchEvent(new Event(type));
      expect(s.asked()).toBe(before + 1);
    },
  );

  it("wakes it on the window's resize", async () => {
    const s = sleeper();
    await Promise.resolve();
    const before = s.asked();
    s.window.dispatchEvent(new Event("resize"));
    expect(s.asked()).toBe(before + 1);
  });

  it("leaves no listener after 10 cycles of a scene made and disposed", () => {
    const [page, window] = [new Counted(), new Counted()];
    for (let cycle = 0; cycle < 10; cycle += 1) {
      const leaving = new AbortController();
      wakeOn({ page, window }, { input: () => undefined, change: () => undefined }, leaving.signal);
      leaving.abort();
    }
    expect([page.live, window.live]).toEqual([0, 0]);
  });
});
