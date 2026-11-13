import { toIrcCommand, type IrcMessage } from "@gnoworld/core";
import { describe, expect, it } from "vitest";
import { createAppStore } from "../../../store/index.ts";
import { Jumping } from "./jumping.ts";

// The link's side of a jump: the window Ergo gives around a message replaces the room's lines, live lines wait, and the way back asks the newest again.
const ALICE = "g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv";
const said = (id: string, text: string, time: string): IrcMessage => ({
  tags: new Map([
    ["msgid", id],
    ["time", time],
    ["account", ALICE],
  ]),
  source: `${ALICE}!u@h`,
  command: toIrcCommand("PRIVMSG") ?? ("" as IrcMessage["command"]),
  params: ["#bubble", text],
});

function setup() {
  const store = createAppStore();
  store.getState().chatActions.follow(["#bubble"]);
  store.getState().chatActions.page("#bubble", [said("live1", "now", "2026-11-11T10:00:00.000Z")]);
  const sent: string[] = [];
  const jumping = new Jumping(store, (line) => {
    sent.push(line);
    return true;
  });
  return { store, sent, jumping };
}
const ids = (store: ReturnType<typeof createAppStore>) =>
  store.getState().chat.rooms["#bubble"]?.lines.map(({ id }) => id);

describe("a room opened at a found message", () => {
  it("sends AROUND and goes no further for a msgid that is refused", () => {
    const { jumping, sent } = setup();
    expect(jumping.around("#bubble", "a b")).toBe(false);
    expect(sent).toEqual([]);
    expect(jumping.around("#bubble", "old1")).toBe(true);
    expect(sent[0]).toContain("CHATHISTORY AROUND #bubble msgid=old1");
  });

  it("shows the window in place of the lines, takes no other page and no live line, until the way back", () => {
    const { store, jumping, sent } = setup();
    jumping.around("#bubble", "old1");
    const window = [
      said("old0", "before", "2026-11-04T14:00:00.000Z"),
      said("old1", "found", "2026-11-04T14:05:00.000Z"),
    ];
    expect(jumping.page("#bubble", window)).toBe(true);
    expect(ids(store)).toEqual(["old0", "old1"]);
    expect(store.getState().chat.rooms["#bubble"]?.jump).toBe("old1");
    store.getState().chatActions.page("#bubble", [said("live2", "late page", "2026-11-11T10:01:00.000Z")]);
    store.getState().chatActions.heard(said("live3", "live", "2026-11-11T10:02:00.000Z"));
    expect(ids(store)).toEqual(["old0", "old1"]);
    jumping.latest("#bubble");
    expect(store.getState().chat.rooms["#bubble"]?.jump).toBeUndefined();
    expect(ids(store)).toEqual([]);
    expect(sent.at(-1)).toMatch(/^CHATHISTORY LATEST #bubble \* \d+$/);
  });

  it("takes an ordinary page for a page that does not hold the message, and asks nothing to go back from a room not read around", () => {
    const { store, jumping, sent } = setup();
    jumping.around("#bubble", "old1");
    expect(jumping.page("#bubble", [said("x", "other", "2026-11-11T09:00:00.000Z")])).toBe(false);
    expect(store.getState().chat.rooms["#bubble"]?.jump).toBeUndefined();
    const before = sent.length;
    jumping.latest("#bubble");
    expect(sent).toHaveLength(before);
  });

  it("forgets a jump asked for a room the view left, and keeps one for the room it moved to", () => {
    const { store, jumping } = setup();
    const window = [said("old1", "found", "2026-11-04T14:05:00.000Z")];
    jumping.around("#bubble", "old1");
    jumping.away("#other");
    expect(jumping.page("#bubble", window)).toBe(false);
    expect(store.getState().chat.rooms["#bubble"]?.jump).toBeUndefined();
    jumping.around("#bubble", "old1");
    jumping.away("#bubble");
    expect(jumping.page("#bubble", window)).toBe(true);
  });
});
