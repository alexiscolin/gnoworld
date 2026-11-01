import { parseLine, type IrcMessage } from "@gnoworld/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LINES_KEPT, REACTIONS_KEPT } from "./chat.ts";
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
    expect(createAppStore().getState().chat).toEqual({ me: undefined, rooms: {}, listed: undefined });
  });

  it("keeps the rooms the server lists, and none of a list that could not come", () => {
    const store = createAppStore();
    const list = [{ name: null, rooms: [{ room: "#earth", type: "open" as const }] }];
    store.getState().chatActions.listed(list);
    expect(store.getState().chat.listed).toBe(list);
    store.getState().chatActions.listed(undefined);
    expect(store.getState().chat.listed).toBeUndefined();
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

  // The code review (CR3): each connection's page waited on, not the first's alone.
  it("forgets that a room's history came when the link drops", () => {
    const t = following();
    t.page("#bubble", []);
    t.disconnected();
    expect(t.room("#bubble")?.paged).toBeUndefined();
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

// The room edit's red pass (R1): a correction is a line of its own, so a REDACT of its line must not leave it showing the
// deleted words, and a refused delete of the line must never bring the words edited out back.
describe("the store's chat slice: a deleted line's corrections", () => {
  const corrected = (id: string, edits: string, { text, account = "alice" }: { text: string; account?: string }) =>
    read(
      `@msgid=${id};time=2026-10-25T10:00:05.000Z;account=${account};+gnoworld/edit=${edits} :${account}!u@h PRIVMSG #bubble :${text}`,
    );
  const ids = (t: ReturnType<typeof following>) => t.room("#bubble")?.lines.map((line) => line.id);
  const held = () => {
    const t = following();
    t.heard(said("#bubble", "a", "the original"));
    t.heard(corrected("e1", "a", { text: "the correction" }));
    return t;
  };

  it("takes the line's corrections with it at a REDACT of the line", () => {
    const t = held();
    t.heard(read(":alice!u@h REDACT #bubble a"));
    expect(ids(t)).toEqual([]);
  });

  it("takes them at a moderator's REDACT of the line too, the author's words being the line's as shown", () => {
    const t = held();
    t.heard(read(":gnoworld!u@h REDACT #bubble a :hidden by moderation"));
    expect(ids(t)).toEqual([]);
  });

  it("keeps another account's line that names the deleted one, which was never its correction", () => {
    const t = held();
    t.heard(corrected("e2", "a", { text: "a plain reply", account: "bob" }));
    t.heard(read(":gnoworld!u@h REDACT #bubble a"));
    expect(ids(t)).toEqual(["e2"]);
  });

  it("keeps the correction at a REDACT of the correction alone while its line is held, so no edited-out words return", () => {
    const t = held();
    t.heard(read(":alice!u@h REDACT #bubble e1"));
    expect(ids(t)).toEqual(["a", "e1"]);
    t.heard(read(":alice!u@h REDACT #bubble a"));
    expect(ids(t)).toEqual([]);
  });

  it("takes a moderator's REDACT of the correction alone, the line showing as it was", () => {
    const t = held();
    t.heard(read(":gnoworld!u@h REDACT #bubble e1 :hidden by moderation"));
    expect(ids(t)).toEqual(["a"]);
  });

  it("drops a correction's REDACT when its line is not held, as any other line's", () => {
    const t = following();
    t.heard(corrected("e1", "a", { text: "the correction" }));
    t.heard(read(":alice!u@h REDACT #bubble e1"));
    expect(ids(t)).toEqual([]);
  });

  it("tells a refused REDACT of a correction as its line's, the line being what the room shows", () => {
    const t = held();
    t.heard(read(":ergo FAIL REDACT REDACT_FORBIDDEN #bubble e1 :You are not authorised to delete this message"));
    expect(t.room("#bubble")?.refused).toBe("a");
  });

  it("leaves a refusal naming a line it does not hold as it was told", () => {
    const t = held();
    t.heard(read(":ergo FAIL REDACT REDACT_FORBIDDEN #bubble zz :You are not authorised to delete this message"));
    expect(t.room("#bubble")?.refused).toBe("zz");
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

// 4d: a room keeps the reactions Ergo relays and replays (TAGMSG, draft/react) beside its lines: the newest of an
// account to a line with an emoji, in time order, the newest REACTIONS_KEPT; the page counts them (core's reactionsOn).
describe("the store's chat slice: reactions", () => {
  const reacted = (room: string, id: string, { to = "m1", emoji = "👍", who = "alice", time = T0 } = {}) =>
    read(`@msgid=${id};time=${time};account=${who};+draft/react=${emoji};+reply=${to} :${who}!u@h TAGMSG ${room}`);
  const at = (n: number) => new Date(Date.parse(T0) + n * 1000).toISOString();
  const ids = (room: ReturnType<ReturnType<typeof following>["room"]>) => room?.reactions?.map(({ id }) => id);

  it("starts a room with no reaction", () => {
    expect(following().room("#bubble")?.reactions).toBeUndefined();
  });

  it("keeps a live reaction in its room alone", () => {
    const t = following();
    t.heard(said("#bubble", "m1", "hello"));
    t.heard(reacted("#Bubble", "r1"));
    expect(t.room("#bubble")?.reactions).toEqual([
      { id: "r1", time: T0, to: "m1", emoji: "👍", who: "alice", on: true },
    ]);
    expect(t.room("#bubble/games")?.reactions).toBeUndefined();
  });

  it("keeps a page's reactions beside its lines, each once, a page brought again included", () => {
    const t = following();
    t.page("#bubble", [
      said("#bubble", "m1", "hello"),
      reacted("#bubble", "r1"),
      reacted("#bubble", "r2", { who: "bob" }),
    ]);
    t.page("#bubble", [reacted("#bubble", "r1")]);
    expect(t.room("#bubble")?.lines.map(({ id }) => id)).toEqual(["m1"]);
    expect(ids(t.room("#bubble"))).toEqual(["r1", "r2"]);
  });

  it("takes from a page only the reactions of its room", () => {
    const t = following();
    t.page("#bubble", [reacted("#bubble/games", "r1"), reacted("#bubble", "r2")]);
    expect(ids(t.room("#bubble"))).toEqual(["r2"]);
    expect(t.room("#bubble/games")?.reactions).toBeUndefined();
  });

  it("drops a reaction a REDACT names, and keeps the line it answered", () => {
    const t = following();
    t.heard(said("#bubble", "m1", "hello"));
    t.heard(reacted("#bubble", "r1"));
    t.heard(reacted("#bubble", "r2", { emoji: "😂" }));
    t.heard(read(":gnoworld!u@h REDACT #bubble r1"));
    expect(ids(t.room("#bubble"))).toEqual(["r2"]);
    expect(t.room("#bubble")?.lines.map(({ id }) => id)).toEqual(["m1"]);
  });

  it("notifies once of a reaction heard twice, and no one of a TAGMSG that is no reaction or of a room not followed", () => {
    const t = following();
    // The first page of a room is told once (4f's paged mark): the count starts after it.
    t.page("#bubble", []);
    const before = t.notified();
    t.heard(reacted("#bubble", "r1"));
    t.heard(reacted("#bubble", "r1"));
    expect(t.notified()).toBe(before + 1);
    // A TAGMSG of a tag no one reads (+typing is 4f's, and tells its room).
    t.heard(read(`@msgid=r2;time=${T0};account=alice;+example=1 :alice!u@h TAGMSG #bubble`));
    t.heard(reacted("#garden", "r3"));
    t.page("#bubble", [reacted("#bubble", "r4", { emoji: "nice" })]);
    expect(t.notified()).toBe(before + 1);
    expect(t.store.getState().chat.rooms["#garden"]).toBeUndefined();
  });

  it("keeps the reactions while the link is down, and lets them go with their room", () => {
    const t = following();
    t.heard(reacted("#bubble", "r1"));
    t.disconnected();
    expect(ids(t.room("#bubble"))).toEqual(["r1"]);
    t.follow([]);
    expect(t.store.getState().chat.rooms).toEqual({});
  });

  // A reaction names a msgid; another room's line of that msgid is not its line (R8).
  it("keeps a reaction naming another room's line in its own room, the other room untouched", () => {
    const t = following();
    t.heard(said("#bubble", "m1", "hello"));
    const games = t.room("#bubble/games");
    const bubble = t.room("#bubble");
    t.heard(reacted("#bubble/games", "r1", { to: "m1" }));
    expect(t.room("#bubble")).toBe(bubble);
    expect(ids(t.room("#bubble/games"))).toEqual(["r1"]);
    expect(t.room("#bubble/games")).not.toBe(games);
  });

  it("keeps 200 lines' five reactions each, by five accounts, a whole window's", () => {
    const t = following();
    for (let line = 0; line < 200; line += 1)
      for (let who = 0; who < 5; who += 1)
        t.heard(
          reacted("#bubble", `r${String(line)}-${String(who)}`, {
            to: `m${String(line)}`,
            who: `a${String(who)}`,
            time: at(line * 5 + who),
          }),
        );
    expect(t.room("#bubble")?.reactions).toHaveLength(1000);
    // The green pass (G12): the window's size itself, not a bound of it.
    expect(REACTIONS_KEPT).toBe(1000);
  });

  it("holds 10,000 reactions of one account to one line with one emoji to one, evicting no other account's", () => {
    const t = following();
    t.heard(reacted("#bubble", "theirs", { who: "bob" }));
    for (let n = 0; n < 10_000; n += 1) t.heard(reacted("#bubble", `r${String(n)}`, { time: at(n + 1) }));
    expect(ids(t.room("#bubble"))).toEqual(["theirs", "r9999"]);
  });

  it("holds a flood of distinct reactions to the newest REACTIONS_KEPT, the newest run of them", () => {
    const t = following();
    const flood = 1500;
    for (let n = 0; n < flood; n += 1)
      t.heard(reacted("#bubble", `r${String(n)}`, { who: `a${String(n)}`, time: at(n) }));
    const kept = t.room("#bubble")?.reactions ?? [];
    expect(kept).toHaveLength(1000);
    expect(kept[0]?.id).toBe("r500");
    expect(kept.at(-1)?.id).toBe(`r${String(flood - 1)}`);
  });
});

// R10: a room's reaction Ergo refused is said until the page has said it.
describe("the store's chat slice: a reaction Ergo refused", () => {
  it("keeps a refused reaction with its room until it is dismissed, a refused delete's dismissal with it", () => {
    const t = following();
    t.reactionRefused("#bubble");
    expect(t.room("#bubble")?.cannotReact).toBe(true);
    expect(t.room("#bubble/games")?.cannotReact).toBeUndefined();
    t.dismissed("#bubble");
    expect(t.room("#bubble")?.cannotReact).toBeUndefined();
  });

  it("notifies once of a refusal said twice, and no one of one in a room not followed", () => {
    const t = following();
    const before = t.notified();
    t.reactionRefused("#bubble");
    t.reactionRefused("#bubble");
    t.reactionRefused("#garden");
    expect(t.notified()).toBe(before + 1);
    expect(t.store.getState().chat.rooms["#garden"]).toBeUndefined();
  });
});
