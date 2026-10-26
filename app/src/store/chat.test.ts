import { parseLine, type IrcMessage } from "@gnoworld/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LINES_KEPT } from "./chat.ts";
import { createAppStore } from "./index.ts";

const ME = "guest-ab12cd";
const T0 = "2026-10-25T10:00:00.000Z";
const read = (line: string): IrcMessage => {
  const parsed = parseLine(line);
  if (!parsed.ok) throw new Error(`the test's line does not parse: ${line}`);
  return parsed.message;
};
const said = (room: string, id: string, text: string) =>
  read(`@msgid=${id};time=${T0};account=alice :alice!u@h PRIVMSG ${room} :${text}`);
// The nth line of a room, n seconds after T0: its id m and n on five digits, its text n.
const numbered = (room: string, n: number) => {
  const time = new Date(Date.parse(T0) + n * 1000).toISOString();
  return read(
    `@msgid=m${String(n).padStart(5, "0")};time=${time};account=alice :alice!u@h PRIVMSG ${room} :${String(n)}`,
  );
};

// A store following two rooms, connected as ME, and the count of its notifications from here on.
const following = () => {
  const store = createAppStore();
  const actions = store.getState().chatActions;
  actions.follow(["#bubble", "#bubble/games"]);
  actions.connected(ME);
  let heard = 0;
  store.subscribe(() => {
    heard += 1;
  });
  return { store, ...actions, room: (id: string) => store.getState().chat.rooms[id], notified: () => heard };
};

describe("the store's chat slice", () => {
  it("starts with no room and no nick", () => {
    expect(createAppStore().getState().chat).toEqual({ me: undefined, rooms: {} });
  });

  it("follows the rooms it is given, each empty, and drops the ones it no longer is", () => {
    const store = createAppStore();
    const { follow } = store.getState().chatActions;
    follow(["#bubble", "#bubble/games"]);
    const empty = { lines: [], members: [], topic: undefined };
    expect(store.getState().chat.rooms).toEqual({ "#bubble": empty, "#bubble/games": empty });
    follow(["#bubble"]);
    expect(Object.keys(store.getState().chat.rooms)).toEqual(["#bubble"]);
  });

  it("follows a new set of rooms of the same size and first room", () => {
    const store = createAppStore();
    const { follow } = store.getState().chatActions;
    follow(["#bubble", "#bubble/games"]);
    follow(["#bubble", "#bubble/news"]);
    expect(Object.keys(store.getState().chat.rooms)).toEqual(["#bubble", "#bubble/news"]);
  });

  it("keeps what it holds of a room it still follows", () => {
    const t = following();
    t.heard(said("#bubble", "a", "hello"));
    const kept = t.room("#bubble");
    t.follow(["#bubble", "#bubble/news"]);
    expect(t.room("#bubble")).toBe(kept);
  });

  it("adds a live line to its room alone, the other room left as it was", () => {
    const t = following();
    const games = t.room("#bubble/games");
    t.heard(said("#bubble", "a", "hello"));
    expect(t.room("#bubble")?.lines.map((line) => line.text)).toEqual(["hello"]);
    expect(t.room("#bubble/games")).toBe(games);
  });

  it.each([
    ["a line of a room it does not follow", said("#garden", "a", "x")],
    ["a PING", read("PING :x")],
    ["a line it already holds", said("#bubble", "a", "hello")],
  ])("changes nothing, and tells no one, for %s", (_, message) => {
    const t = following();
    t.heard(said("#bubble", "a", "hello"));
    const chat = t.store.getState().chat;
    const before = t.notified();
    t.heard(message);
    expect(t.store.getState().chat).toBe(chat);
    expect(t.notified()).toBe(before);
  });

  it("follows who is here: my JOIN starts the list, NAMES fills it, a QUIT leaves every room", () => {
    const t = following();
    t.heard(read(`:${ME}!u@h JOIN #bubble`));
    t.heard(read(`:${ME}!u@h JOIN #bubble/games`));
    t.heard(read(`:ergo 353 ${ME} = #bubble :@alice ${ME}`));
    t.heard(read(`:ergo 353 ${ME} = #bubble/games :alice bob ${ME}`));
    expect(t.room("#bubble")?.members).toEqual(["alice", ME]);
    t.heard(read(":alice!u@h QUIT :gone"));
    expect(t.room("#bubble")?.members).toEqual([ME]);
    expect(t.room("#bubble/games")?.members).toEqual(["bob", ME]);
  });

  it("reads the room's description from its topic", () => {
    const t = following();
    t.heard(read(`:ergo 332 ${ME} #bubble :Bubbles here`));
    expect(t.room("#bubble")?.topic).toBe("Bubbles here");
    expect(t.room("#bubble/games")?.topic).toBeUndefined();
  });

  it("hides a line Ergo redacts", () => {
    const t = following();
    t.heard(said("#bubble", "a", "one"));
    t.heard(said("#bubble", "b", "two"));
    t.heard(read(":gnoworld!u@h REDACT #bubble a"));
    expect(t.room("#bubble")?.lines.map((line) => line.id)).toEqual(["b"]);
  });

  it("adds a history page at once, in time order, its lines each once beside the live ones, telling once", () => {
    const t = following();
    t.heard(numbered("#bubble", 3));
    const before = t.notified();
    t.page("#bubble", [numbered("#bubble", 1), numbered("#bubble", 3), numbered("#bubble", 2)]);
    expect(t.room("#bubble")?.lines.map((line) => line.text)).toEqual(["1", "2", "3"]);
    expect(t.notified()).toBe(before + 1);
  });

  // The green pass (G1): the New mark waits on a room's history, which a live line before it must not stand for.
  it("keeps that a room's history came, an empty page too, and not before", () => {
    const t = following();
    t.heard(said("#bubble", "a", "live"));
    expect(t.room("#bubble")?.paged).toBeUndefined();
    t.page("#bubble", []);
    expect(t.room("#bubble")?.paged).toBe(true);
  });

  it("takes from a page only the lines of its room", () => {
    const t = following();
    t.page("#bubble", [said("#bubble", "a", "mine"), said("#garden", "b", "theirs"), read("PING :x")]);
    expect(t.room("#bubble")?.lines.map((line) => line.text)).toEqual(["mine"]);
  });

  it("changes nothing for a page of a room it does not follow, or a page with nothing new", () => {
    const t = following();
    t.heard(said("#bubble", "a", "one"));
    // Its first page came: a page after it brings what is new, or nothing.
    t.page("#bubble", []);
    const chat = t.store.getState().chat;
    t.page("#garden", [said("#garden", "x", "theirs")]);
    t.page("#bubble", [said("#bubble", "a", "one")]);
    expect(t.store.getState().chat).toBe(chat);
  });

  it(`keeps the newest ${String(LINES_KEPT)} lines of a room, its window`, () => {
    expect(LINES_KEPT).toBe(200);
    const t = following();
    t.page(
      "#bubble",
      Array.from({ length: 300 }, (_, n) => numbered("#bubble", n)),
    );
    const lines = t.room("#bubble")?.lines ?? [];
    expect(lines).toHaveLength(200);
    expect(lines.at(0)?.text).toBe("100");
    expect(lines.at(-1)?.text).toBe("299");
  });

  it("names me once connected", () => {
    expect(following().store.getState().chat.me).toBe(ME);
  });

  it.each([
    ["my PART", `:${ME}!u@h PART #bubble`],
    ["my KICK", `:bob!u@h KICK #bubble ${ME} :out`],
  ])("empties a room's list on %s, though others are here", (_, text) => {
    const t = following();
    t.heard(read(`:${ME}!u@h JOIN #bubble`));
    t.heard(read(`:ergo 353 ${ME} = #bubble :alice bob ${ME}`));
    t.heard(read(text));
    expect(t.room("#bubble")?.members).toEqual([]);
  });

  it("starts a room's list again on my JOIN, though others are held", () => {
    const t = following();
    t.heard(read(`:ergo 353 ${ME} = #bubble :alice`));
    t.heard(read(`:${ME}!u@h JOIN #bubble`));
    expect(t.room("#bubble")?.members).toEqual([ME]);
  });

  it("holds a flood of 10,000 live lines to the newest 200", () => {
    const t = following();
    for (let n = 0; n < 10_000; n += 1) t.heard(numbered("#bubble", n));
    const lines = t.room("#bubble")?.lines ?? [];
    expect(lines).toHaveLength(200);
    expect(lines.at(0)?.text).toBe("9800");
    expect(lines.at(-1)?.text).toBe("9999");
  });

  it.each([
    [200, "0"],
    [201, "1"],
  ])("holds %i live lines from line %s on", (count, first) => {
    const t = following();
    for (let n = 0; n < count; n += 1) t.heard(numbered("#bubble", n));
    expect(t.room("#bubble")?.lines).toHaveLength(200);
    expect(t.room("#bubble")?.lines.at(0)?.text).toBe(first);
  });

  it("tells once, and only once, for each change of its own", () => {
    const t = following();
    const chat = t.store.getState().chat;
    t.follow(["#bubble", "#bubble/games"]);
    expect(t.store.getState().chat).toBe(chat);
    t.connected(ME);
    expect(t.notified()).toBe(0);
    t.connected("guest-other");
    t.connected("guest-other");
    expect(t.notified()).toBe(1);
    t.disconnected();
    t.disconnected();
    expect(t.notified()).toBe(2);
  });

  it("tells once for a QUIT that changes two rooms", () => {
    const t = following();
    t.heard(read(`:ergo 353 ${ME} = #bubble :alice`));
    t.heard(read(`:ergo 353 ${ME} = #bubble/games :alice`));
    const before = t.notified();
    t.heard(read(":alice!u@h QUIT :gone"));
    expect(t.notified()).toBe(before + 1);
  });

  it("follows no room when given none, and each room once when given one twice", () => {
    const t = following();
    t.follow([]);
    expect(t.store.getState().chat.rooms).toEqual({});
    t.follow(["#bubble", "#bubble"]);
    expect(Object.keys(t.store.getState().chat.rooms)).toEqual(["#bubble"]);
  });

  it("keeps the topic through lines that are not the topic's", () => {
    const t = following();
    t.heard(read(`:ergo 332 ${ME} #bubble :Now`));
    t.heard(said("#bubble", "a", "hello"));
    t.heard(read(":bob!u@h JOIN #bubble"));
    expect(t.room("#bubble")?.topic).toBe("Now");
  });

  // A history page carries the room's events too (draft/event-playback): it changes the lines alone.
  it("takes from a page its lines alone: no JOIN, QUIT or TOPIC in it changes who is here or the topic", () => {
    const t = following();
    t.heard(read(`:${ME}!u@h JOIN #bubble`));
    t.heard(read(`:ergo 353 ${ME} = #bubble :alice ${ME}`));
    t.heard(read(`:ergo 332 ${ME} #bubble :Now`));
    t.page("#bubble", [
      read("@batch=h1 :bob!u@h JOIN #bubble"),
      read("@batch=h1 :alice!u@h QUIT :gone"),
      read("@batch=h1 :alice!u@h TOPIC #bubble :Old"),
      read("@batch=h1 :gnoworld!u@h REDACT #bubble a"),
    ]);
    expect(t.room("#bubble")).toMatchObject({ members: ["alice", ME], topic: "Now" });
  });

  it("forgets who is here and its nick when the link drops, and keeps the lines and topic to show meanwhile", () => {
    const t = following();
    t.heard(read(`:${ME}!u@h JOIN #bubble`));
    t.heard(said("#bubble", "a", "kept"));
    t.heard(read(`:ergo 332 ${ME} #bubble :Bubbles here`));
    t.disconnected();
    expect(t.store.getState().chat.me).toBeUndefined();
    expect(t.room("#bubble")).toEqual({
      lines: [expect.objectContaining({ text: "kept" })],
      members: [],
      topic: "Bubbles here",
    });
  });

  it("starts a room's list again on my JOIN after a reconnect, and dedupes the history it brings again", () => {
    const t = following();
    t.heard(read(`:${ME}!u@h JOIN #bubble`));
    t.heard(read(`:ergo 353 ${ME} = #bubble :alice ${ME}`));
    t.heard(numbered("#bubble", 1));
    t.disconnected();
    t.connected(ME);
    t.heard(read(`:${ME}!u@h JOIN #bubble`));
    t.page("#bubble", [numbered("#bubble", 1), numbered("#bubble", 2)]);
    expect(t.room("#bubble")?.members).toEqual([ME]);
    expect(t.room("#bubble")?.lines.map((line) => line.id)).toEqual(["m00001", "m00002"]);
  });
});

// 4c's message menu: Ergo's refusal of a delete stays with its room until the page has said it.
describe("the store's chat slice: a delete Ergo refused", () => {
  const refusal = (room: string, id: string) =>
    read(`:ergo FAIL REDACT REDACT_FORBIDDEN ${room} ${id} :You are not authorised to delete this message`);

  it("keeps the msgid Ergo refused to delete with its room, until it is dismissed", () => {
    const t = following();
    t.heard(said("#bubble", "a", "hello"));
    t.heard(refusal("#bubble", "a"));
    expect(t.room("#bubble")?.refused).toBe("a");
    expect(t.room("#bubble/games")?.refused).toBeUndefined();
    t.heard(said("#bubble", "b", "again"));
    expect(t.room("#bubble")?.refused).toBe("a");
    t.dismissed("#bubble");
    expect(t.room("#bubble")?.refused).toBeUndefined();
    expect(t.room("#bubble")?.lines.map((line) => line.id)).toEqual(["a", "b"]);
  });

  it("keeps nothing of a refusal in a room not followed, and notifies no one of it, nor of a dismissal of nothing", () => {
    const t = following();
    const before = t.notified();
    t.heard(refusal("#garden", "a"));
    t.dismissed("#bubble");
    t.dismissed("#garden");
    expect(t.notified()).toBe(before);
    expect(t.store.getState().chat.rooms["#garden"]).toBeUndefined();
  });
});

// 4f: who is typing in each room (IRCv3's +typing), on the store's clock.
describe("the store's chat slice: who is typing", () => {
  const typing = (room: string, nick: string, state: string) =>
    read(`@+typing=${state};time=${T0};account=${nick} :${nick}!u@h TAGMSG ${room}`);
  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps who is typing in each room, until their 6 s are past, as the store's clock reads it", () => {
    vi.useFakeTimers({ now: Date.parse(T0) });
    const t = following();
    t.heard(typing("#bubble", "alice", "active"));
    expect(t.room("#bubble")?.typing).toEqual({ alice: Date.parse(T0) + 6_000 });
    expect(t.room("#bubble/games")?.typing).toBeUndefined();
    t.heard(said("#bubble", "a", "hello"));
    expect(t.room("#bubble")?.typing).toBeUndefined();
  });

  // The red pass (R6): the page's clock, the line's time an hour off.
  it("counts a typist's 6 s from its own clock, never the line's time", () => {
    vi.useFakeTimers({ now: Date.parse(T0) });
    const t = following();
    t.heard(read("@+typing=active;time=2026-10-25T09:00:00.000Z :alice!u@h TAGMSG #bubble"));
    expect(t.room("#bubble")?.typing).toEqual({ alice: Date.parse(T0) + 6_000 });
  });

  it("ignores my own typing, which Ergo echoes, and tells no one of it, another's kept", () => {
    const t = following();
    t.heard(typing("#bubble", "alice", "active"));
    const before = t.notified();
    t.heard(typing("#bubble", ME, "active"));
    expect(Object.keys(t.room("#bubble")?.typing ?? {})).toEqual(["alice"]);
    expect(t.notified()).toBe(before);
  });

  // The red pass (R17): noise makes no room and tells no one; a flood of one nick is one typist.
  it("stays quiet on typing in a room it does not follow, to a nick, and a done from nobody", () => {
    const t = following();
    const before = t.notified();
    t.heard(typing("#garden", "alice", "active"));
    t.heard(typing(ME, "alice", "active"));
    t.heard(typing("#bubble", "stranger", "done"));
    expect(t.notified()).toBe(before);
    expect(t.store.getState().chat.rooms["#garden"]).toBeUndefined();
  });

  it("holds one typist for a thousand actives of one nick", () => {
    const t = following();
    for (let n = 0; n < 1_000; n += 1) t.heard(typing("#bubble", "alice", "active"));
    expect(Object.keys(t.room("#bubble")?.typing ?? {})).toEqual(["alice"]);
  });

  it("forgets who is typing when the link drops", () => {
    const t = following();
    t.heard(typing("#bubble", "alice", "active"));
    expect(t.room("#bubble")?.typing).toBeDefined();
    t.disconnected();
    expect(t.room("#bubble")?.typing).toBeUndefined();
  });
});

// 4f: each room's reading place (Ergo's draft/read-marker), forward alone, on the store's clock.
describe("the store's chat slice: the reading place", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps the reading place Ergo gives each room, forward alone", () => {
    const t = following();
    const later = "2026-10-25T10:05:00.000Z";
    t.heard(read(`:ergo MARKREAD #bubble timestamp=${later}`));
    t.heard(read(`:ergo MARKREAD #bubble timestamp=${T0}`));
    t.heard(read(`:ergo MARKREAD #bubble/games *`));
    expect(t.room("#bubble")?.read).toBe(later);
    expect(t.room("#bubble/games")?.read).toBeUndefined();
  });

  // The red pass (R17): a place for a room not followed makes no room and tells no one.
  it("keeps no place for a room it does not follow, and tells no one", () => {
    const t = following();
    const before = t.notified();
    t.heard(read(`:ergo MARKREAD #garden timestamp=${T0}`));
    expect(t.notified()).toBe(before);
    expect(t.store.getState().chat.rooms["#garden"]).toBeUndefined();
  });

  // The red pass (R13): the store reads a place against its own clock.
  it("reads a place more than 5 minutes past its clock as none", () => {
    vi.useFakeTimers({ now: Date.parse(T0) });
    const t = following();
    t.heard(read(":ergo MARKREAD #bubble timestamp=2026-10-25T10:05:00.001Z"));
    t.heard(read(":ergo MARKREAD #bubble/games timestamp=2026-10-25T10:05:00.000Z"));
    expect(t.room("#bubble")?.read).toBeUndefined();
    expect(t.room("#bubble/games")?.read).toBe("2026-10-25T10:05:00.000Z");
  });

  it("keeps the reading place through a drop of the link, Ergo's being the account's", () => {
    const t = following();
    t.heard(read(`:ergo MARKREAD #bubble timestamp=${T0}`));
    t.disconnected();
    expect(t.room("#bubble")?.read).toBe(T0);
  });
});
