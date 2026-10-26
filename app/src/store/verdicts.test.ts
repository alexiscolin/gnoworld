import { describe, expect, it } from "vitest";
import { createAppStore } from "./index.ts";
import { VERDICTS_KEPT } from "./verdicts.ts";

// A store and the count of its notifications from here on.
const store = () => {
  const made = createAppStore();
  let heard = 0;
  made.subscribe(() => {
    heard += 1;
  });
  const { judged } = made.getState().verdictActions;
  return {
    judged,
    of: (room: string) => made.getState().verdicts[room],
    order: (room: string) => made.getState().verdictsOrder[room],
    notified: () => heard,
  };
};

// 4g: the verdicts' stream tells which line a link's player may open on: "checked", or "hidden" for good.
describe("the store's verdicts", () => {
  it("starts with none", () => {
    expect(createAppStore().getState().verdicts).toEqual({});
  });

  it("keeps each line's verdict with its room, a later one over an earlier", () => {
    const t = store();
    t.judged({ msgid: "a", room: "#bubble", state: "checked" });
    t.judged({ msgid: "b", room: "#bubble", state: "hidden" });
    t.judged({ msgid: "a", room: "#bubble/games", state: "hidden" });
    expect(t.of("#bubble")).toEqual({ a: "checked", b: "hidden" });
    expect(t.of("#bubble/games")).toEqual({ a: "hidden" });
    t.judged({ msgid: "a", room: "#bubble", state: "hidden" });
    expect(t.of("#bubble")).toEqual({ a: "hidden", b: "hidden" });
  });

  it("notifies no one of a verdict it holds already", () => {
    const t = store();
    t.judged({ msgid: "a", room: "#bubble", state: "checked" });
    const before = t.notified();
    t.judged({ msgid: "a", room: "#bubble", state: "checked" });
    expect(t.notified()).toBe(before);
  });

  // A long session hears a verdict for each line: a room keeps its newest, past its window's lines twice over.
  it(`keeps a room's ${String(VERDICTS_KEPT)} newest verdicts, dropping the oldest`, () => {
    const t = store();
    for (let n = 0; n <= VERDICTS_KEPT; n += 1) t.judged({ msgid: `m${String(n)}`, room: "#bubble", state: "checked" });
    const kept = Object.keys(t.of("#bubble") ?? {});
    expect(kept).toHaveLength(VERDICTS_KEPT);
    expect(kept[0]).toBe("m1");
    expect(kept.at(-1)).toBe(`m${String(VERDICTS_KEPT)}`);
  });

  // F880: JavaScript orders a key of digits before the others, so an object's order is not the verdicts' order.
  it("drops a room's oldest verdict, not its newest, when the newest msgid is digits", () => {
    const t = store();
    for (let n = 0; n < VERDICTS_KEPT; n += 1) t.judged({ msgid: `m${String(n)}`, room: "#bubble", state: "checked" });
    t.judged({ msgid: "7", room: "#bubble", state: "hidden" });
    expect(t.of("#bubble")?.["7"]).toBe("hidden");
    expect(t.of("#bubble")).not.toHaveProperty("m0");
    expect(Object.keys(t.of("#bubble") ?? {})).toHaveLength(VERDICTS_KEPT);
    for (let n = 0; n < VERDICTS_KEPT; n += 1) t.judged({ msgid: `n${String(n)}`, room: "#bubble", state: "checked" });
    expect(t.of("#bubble")).not.toHaveProperty("7");
  });

  // F880: the server's answer, asked before the hide, can come after the stream's "hidden"; a hide is for good.
  it("keeps a hidden line hidden: a later checked changes nothing and notifies no one", () => {
    const t = store();
    t.judged({ msgid: "a", room: "#bubble", state: "hidden" });
    const before = t.notified();
    t.judged({ msgid: "a", room: "#bubble", state: "checked" });
    expect(t.of("#bubble")).toEqual({ a: "hidden" });
    expect(t.notified()).toBe(before);
  });

  // F880: a line whose verdict changes is one line, not two, in the count the cap reads.
  it("counts a line once though its verdict changed, keeping every line up to the cap", () => {
    const t = store();
    t.judged({ msgid: "m0", room: "#bubble", state: "checked" });
    t.judged({ msgid: "m0", room: "#bubble", state: "hidden" });
    for (let n = 1; n < VERDICTS_KEPT; n += 1) t.judged({ msgid: `m${String(n)}`, room: "#bubble", state: "checked" });
    expect(t.of("#bubble")?.["m0"]).toBe("hidden");
    expect(Object.keys(t.of("#bubble") ?? {})).toHaveLength(VERDICTS_KEPT);
  });

  // F880: the order that picks the verdict to drop holds no more than the verdicts it orders.
  it("keeps a room's order no longer than its verdicts, oldest first", () => {
    const t = store();
    const ids = Array.from({ length: VERDICTS_KEPT + 50 }, (_, n) => `m${String(n)}`);
    for (const msgid of ids) t.judged({ msgid, room: "#bubble", state: "checked" });
    expect(t.order("#bubble")).toEqual(ids.slice(50));
  });
});
