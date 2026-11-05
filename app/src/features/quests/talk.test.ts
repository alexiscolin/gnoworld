import type { Line } from "@gnoworld/core";
import { describe, expect, it } from "vitest";
import { createAppStore } from "../../store/index.ts";
import { watchTalk } from "./talk.ts";

// A quest's talk step (slice 8): done once the reader's own message shows in the hub's main room the step names (Bubble's, "#bubble"), said
// now or brought back by the history; never by another's line, a notice, another room, or before the reader has a nick.
const line = (id: string, from: string, kind: Line["kind"] = "message"): Line => ({
  id,
  time: "2026-11-05T12:00:00.000Z",
  from,
  text: "hello",
  kind,
});
function watched(me: string | undefined) {
  const store = createAppStore();
  const stop = watchTalk(store);
  const say = (room: string, ...lines: Line[]) => {
    const { chat } = store.getState();
    if (chat.rooms[room] === undefined) store.getState().chatActions.follow([...Object.keys(chat.rooms), room]);
    const rooms = store.getState().chat.rooms;
    const held = rooms[room];
    if (held === undefined) throw new Error(`no room ${room}`);
    store.setState({ chat: { ...store.getState().chat, me, rooms: { ...rooms, [room]: { ...held, lines } } } });
  };
  return { store, stop, say, quests: () => store.getState().device.quests };
}

describe("a quest's talk step", () => {
  it("is done by the reader's own message in the hub's main room", () => {
    const { say, quests } = watched("alice");
    say("#bubble", line("a", "noor"), line("b", "alice"));
    expect(quests()).toEqual({ player: ["hello"] });
  });

  it("is not done by another's line, a notice of the reader's, or a side room", () => {
    const { say, quests } = watched("alice");
    say("#bubble", line("a", "noor"));
    say("#bubble", line("a", "noor"), line("b", "alice", "notice"));
    say("#bubble/games", line("c", "alice"));
    say("#earth", line("d", "alice"));
    expect(quests()).toEqual({});
  });

  it("is not done before the reader has a nick", () => {
    const { say, quests } = watched(undefined);
    say("#bubble", line("b", "alice"));
    expect(quests()).toEqual({});
  });

  it("stops hearing once stopped", () => {
    const { say, quests, stop } = watched("alice");
    stop();
    say("#bubble", line("b", "alice"));
    expect(quests()).toEqual({});
  });
});
