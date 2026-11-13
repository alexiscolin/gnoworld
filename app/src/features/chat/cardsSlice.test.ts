import { Address } from "@gnoworld/schemas";
import { describe, expect, it } from "vitest";
import { createAppStore } from "../../store/index.ts";
import { addCards, CARDS_KEPT } from "./cardsSlice.ts";
import { cardsIn } from "./cardsIn.ts";

const KEY = "a".repeat(64);
const OTHER = "b".repeat(64);

const store = () => {
  const made = createAppStore();
  const actions = addCards(made);
  let heard = 0;
  made.subscribe(() => {
    heard += 1;
  });
  return { actions, made, of: (room: string) => cardsIn(made.getState())?.cards[room], notified: () => heard };
};

// Link previews L4: a line has a card only after the server's event (or its answer) says so, and a removal takes it for good.
describe("the store's link cards", () => {
  it("joins the store with the first card, once, and the page has none before", () => {
    const made = createAppStore();
    expect(cardsIn(made.getState())).toBeUndefined();
    const actions = addCards(made);
    expect(addCards(made)).toBe(actions);
    expect(cardsIn(made.getState())?.cards).toEqual({});
  });
  it("holds a line's card only once an event told it, by room and msgid", () => {
    const t = store();
    expect(t.of("#a")).toBeUndefined();
    t.actions.told([{ room: "#a", msgid: "m1", key: KEY }]);
    expect(t.of("#a")).toEqual({ m1: KEY });
    expect(t.of("#b")).toBeUndefined();
  });

  it("takes a card away on an event with no key, and the same one again changes nothing", () => {
    const t = store();
    t.actions.told([{ room: "#a", msgid: "m1", key: KEY }]);
    t.actions.told([{ room: "#a", msgid: "m1", key: null }]);
    expect(t.of("#a")).toEqual({});
    const before = t.notified();
    t.actions.told([{ room: "#a", msgid: "m1", key: null }]);
    expect(t.notified()).toBe(before);
  });

  it("keeps events in the order they came: the last of a line decides, in one batch or two", () => {
    const t = store();
    t.actions.told([
      { room: "#a", msgid: "m1", key: KEY },
      { room: "#a", msgid: "m1", key: OTHER },
    ]);
    expect(t.of("#a")).toEqual({ m1: OTHER });
    t.actions.told([{ room: "#a", msgid: "m1", key: null }]);
    expect(t.of("#a")).toEqual({});
  });

  it("never brings back a removed card by a server's answer asked before the removal", () => {
    const t = store();
    t.actions.told([{ room: "#a", msgid: "m1", key: null }]);
    t.actions.asked([{ room: "#a", msgid: "m1", key: KEY }]);
    expect(t.of("#a")?.["m1"]).toBeUndefined();
  });

  it("lets an answer fill a line the stream said nothing of, and never over a card an event gave", () => {
    const t = store();
    t.actions.told([{ room: "#a", msgid: "m1", key: OTHER }]);
    t.actions.asked([
      { room: "#a", msgid: "m1", key: KEY },
      { room: "#a", msgid: "m2", key: KEY },
    ]);
    expect(t.of("#a")).toEqual({ m1: OTHER, m2: KEY });
  });

  it("holds a room's newest CARDS_KEPT cards, the oldest dropped", () => {
    const t = store();
    t.actions.told(
      Array.from({ length: CARDS_KEPT + 3 }, (_, n) => ({ room: "#a", msgid: `m${String(n)}`, key: KEY })),
    );
    const held = Object.keys(t.of("#a") ?? {});
    expect(held).toHaveLength(CARDS_KEPT);
    expect(held[0]).toBe("m3");
    expect(held.at(-1)).toBe(`m${String(CARDS_KEPT + 2)}`);
  });

  it("holds a room named like an object's own word as an entry, and nothing leaks into the prototype", () => {
    const t = store();
    t.actions.told([{ room: "#a", msgid: "__proto__", key: KEY }]);
    expect(Object.getPrototypeOf(t.of("#a"))).toBe(Object.prototype);
    expect(Object.hasOwn(t.of("#a") ?? {}, "__proto__")).toBe(true);
  });

  it("forgets every card when a session ends, and a removal's memory with it", () => {
    const t = store();
    t.actions.told([{ room: "#a", msgid: "m1", key: KEY }]);
    t.made.getState().loginActions.signedIn(Address.parse("g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv"));
    t.made.getState().loginActions.signedOut();
    expect(cardsIn(t.made.getState())?.cards).toEqual({});
  });
});
