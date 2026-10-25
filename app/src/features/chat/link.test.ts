import { parseLine, type IrcMessage } from "@gnoworld/core";
import { Address } from "@gnoworld/schemas";
import { describe, expect, it } from "vitest";
import type { Result } from "../../lib/api/http.ts";
import type { Ergo, ErgoState, Who } from "../../lib/ergo/ergo.ts";
import { createAppStore } from "../../store/index.ts";
import { chatLink, HISTORY_LINES, ROOMS_JOINED } from "./link.ts";

const ADDRESS = Address.parse("g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5");
const OTHER = Address.parse("g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv");
// The nick drawn, and the one Ergo took after a 433: the link must read the second from the connection.
const DRAWN = "guest-aaaaaa";
const GUEST = "guest-bbbbbb";
const T0 = "2026-10-25T10:00:00.000Z";
const read = (line: string): IrcMessage => {
  const parsed = parseLine(line);
  if (!parsed.ok) throw new Error(`the test's line does not parse: ${line}`);
  return parsed.message;
};
const live = (room: string, id: string, text: string) => `@msgid=${id};time=${T0} :alice!u@h PRIVMSG ${room} :${text}`;

// A connection the test drives, as connectErgo behaves: "connecting" told while connect() runs, "stopped"
// told by stop(), a line sent only while connected.
interface Fake extends Ergo {
  who: Who;
  sent: string[];
  stopped: boolean;
  me: string | undefined;
  connected: boolean;
  state: (state: ErgoState) => void;
  line: (text: string) => void;
}

const setup = (before?: (store: ReturnType<typeof createAppStore>) => void) => {
  const store = createAppStore();
  before?.(store);
  const links: Fake[] = [];
  const asked = { tickets: 0, guests: 0 };
  const link = chatLink({
    store,
    ticket: (): Promise<Result<{ ticket: string }>> => {
      asked.tickets += 1;
      return Promise.resolve({ ok: true, value: { ticket: `t${String(asked.tickets)}` } });
    },
    guest: () => {
      asked.guests += 1;
      return `${DRAWN}${String(asked.guests)}`;
    },
    connect: (who, on) => {
      const fake: Fake = {
        who,
        sent: [],
        stopped: false,
        me: undefined,
        connected: false,
        send: (line) => {
          if (!fake.connected) return false;
          fake.sent.push(line);
          return true;
        },
        stop: () => {
          fake.stopped = true;
          fake.state("stopped");
        },
        nick: () => (fake.connected ? fake.me : undefined),
        state: (state) => {
          fake.connected = state === "connected";
          on.onState(state);
        },
        line: (text) => {
          on.onLine(read(text));
        },
      };
      links.push(fake);
      on.onState("connecting");
      return fake;
    },
  });
  const { signedIn, signedOut } = store.getState().loginActions;
  const last = () => {
    const fake = links.at(-1);
    if (fake === undefined) throw new Error("no connection");
    return fake;
  };
  // Connected as this nick: Ergo's welcome passed, the link told.
  const connected = (nick = GUEST) => {
    const fake = last();
    fake.me = nick;
    fake.state("connected");
    return fake;
  };
  const room = (id: string) => store.getState().chat.rooms[id];
  return { store, link, links, asked, last, connected, signedIn, signedOut, room, chat: () => store.getState().chat };
};
type Setup = ReturnType<typeof setup>;
// A guest's link following these rooms, the first shown, connected.
const guestIn = (rooms: readonly string[]): Setup & { fake: Fake } => {
  const t = setup();
  t.link.follow(rooms);
  t.link.show(rooms[0]);
  t.signedOut();
  return { ...t, fake: t.connected() };
};
const joinedBy = (sent: readonly string[], command: "JOIN" | "PART") =>
  sent.filter((line) => line.startsWith(`${command} `)).flatMap((line) => line.slice(command.length + 1).split(","));

describe("the chat's link: who connects", () => {
  it("opens nothing before it knows the session", () => {
    expect(setup().links).toHaveLength(0);
  });

  it("connects a visitor not logged in as a guest, drawing a nick each connection", () => {
    const t = setup();
    t.signedOut();
    const { who } = t.last();
    expect("guest" in who ? [who.guest(), who.guest()] : []).toEqual([`${DRAWN}1`, `${DRAWN}2`]);
  });

  it("connects an account with its address, a ticket asked for each connection, never kept", async () => {
    const t = setup();
    t.signedIn(ADDRESS);
    const { who } = t.last();
    expect(who).toMatchObject({ account: ADDRESS });
    const tickets = "ticket" in who ? [await who.ticket(), await who.ticket()] : [];
    expect(tickets).toEqual([
      { ok: true, value: { ticket: "t1" } },
      { ok: true, value: { ticket: "t2" } },
    ]);
    expect(t.asked.tickets).toBe(2);
  });

  it.each([
    [
      "logged in",
      (store: ReturnType<typeof createAppStore>) => {
        store.getState().loginActions.signedIn(ADDRESS);
      },
    ],
    [
      "logged out",
      (store: ReturnType<typeof createAppStore>) => {
        store.getState().loginActions.signedOut();
      },
    ],
  ])("connects at once when the session was known before it, %s", (_, before) => {
    const t = setup(before);
    expect(t.links).toHaveLength(1);
  });

  it("names in the store the nick the connection gives, not the one drawn", () => {
    const t = guestIn(["#bubble"]);
    expect(t.chat().me).toBe(GUEST);
    t.fake.line(`:${GUEST}!u@h JOIN #bubble`);
    expect(t.fake.sent.at(-1)).toBe("CHATHISTORY LATEST #bubble * 200");
  });

  it("shows the state Ergo gives while connect() still runs", () => {
    const t = setup();
    t.signedOut();
    expect(t.store.getState().login.chat).toBe("connecting");
  });

  it("connects again as the session changes, the last connection stopped and its events ignored", () => {
    const t = guestIn(["#bubble"]);
    t.signedIn(ADDRESS);
    expect(t.links).toHaveLength(2);
    expect(t.fake.stopped).toBe(true);
    expect(t.last().who).toMatchObject({ account: ADDRESS });
    expect(t.chat().me).toBeUndefined();
    expect(t.room("#bubble")?.members ?? []).toEqual([]);
    expect(t.store.getState().login.chat).toBe("connecting");
    t.connected(ADDRESS);
    t.fake.state("waiting");
    t.fake.line(live("#bubble", "a", "stale"));
    expect(t.chat().me).toBe(ADDRESS);
    expect(t.store.getState().login.chat).toBe("connected");
    expect(t.room("#bubble")?.lines ?? []).toEqual([]);
  });

  it("connects again for another account", () => {
    const t = setup();
    t.signedIn(ADDRESS);
    t.signedIn(OTHER);
    expect(t.links).toHaveLength(2);
    expect(t.links[0]?.stopped).toBe(true);
    expect(t.last().who).toMatchObject({ account: OTHER });
  });

  it.each([
    [
      "the same account",
      (t: Setup) => {
        t.signedIn(ADDRESS);
      },
      (t: Setup) => {
        t.signedIn(ADDRESS);
      },
    ],
    [
      "nobody logged in",
      (t: Setup) => {
        t.signedOut();
      },
      (t: Setup) => {
        t.signedOut();
      },
    ],
  ])("opens no second connection when told %s again, nor on its own state's changes", (_, first, again) => {
    const t = setup();
    first(t);
    again(t);
    t.connected();
    t.last().state("waiting");
    t.connected();
    expect(t.links).toHaveLength(1);
  });

  // 4b's pre-merge, the security-reviewer: a member's rooms must not follow it into a guest's connection.
  it("starts a new session with no room: the last one's rooms neither joined nor kept", () => {
    const t = setup();
    t.link.follow(["#bubble", "#bubble/members"]);
    t.link.show("#bubble/members");
    t.signedIn(ADDRESS);
    t.connected(ADDRESS);
    t.last().line(`@msgid=a;time=${T0} :alice!u@h PRIVMSG #bubble/members :members only`);
    t.signedOut();
    expect(t.chat().rooms).toEqual({});
    expect(t.connected().sent).toEqual([]);
  });

  it("connects as a guest when Ergo says the session is gone, the store logged out", () => {
    const t = setup();
    t.signedIn(ADDRESS);
    t.last().state("logged-out");
    expect(t.store.getState().login.session).toEqual({ kind: "out" });
    expect(t.links).toHaveLength(2);
    expect("guest" in t.last().who).toBe(true);
  });
});

describe("the chat's link: the rooms it joins", () => {
  it("joins the rooms it follows once connected, in one line, and names its nick in the store", () => {
    const t = setup();
    t.link.follow(["#bubble", "#bubble/games"]);
    t.signedOut();
    expect(t.last().sent).toEqual([]);
    const fake = t.connected();
    expect(fake.sent).toEqual(["JOIN #bubble,#bubble/games"]);
    expect(t.chat().me).toBe(GUEST);
    expect(t.store.getState().login.chat).toBe("connected");
  });

  it("parts a room it stops following before it joins a new one, so Ergo's limit never refuses the swap", () => {
    const t = guestIn(["#bubble"]);
    t.link.follow(["#bubble/games"]);
    expect(t.fake.sent.slice(1)).toEqual(["PART #bubble", "JOIN #bubble/games"]);
    expect(Object.keys(t.chat().rooms)).toEqual(["#bubble/games"]);
  });

  it("parts all 100 before it joins any of another 100", () => {
    const first = Array.from({ length: 100 }, (_, n) => `#r${String(n).padStart(3, "0")}`);
    const then = Array.from({ length: 100 }, (_, n) => `#s${String(n).padStart(3, "0")}`);
    const t = guestIn(first);
    t.fake.sent.length = 0;
    t.link.follow(then);
    const firstJoin = t.fake.sent.findIndex((line) => line.startsWith("JOIN "));
    expect(t.fake.sent.slice(0, firstJoin).every((line) => line.startsWith("PART "))).toBe(true);
    expect(joinedBy(t.fake.sent, "PART")).toEqual(first);
    expect(joinedBy(t.fake.sent, "JOIN")).toEqual(then);
  });

  it.each([
    ["the same rooms", ["#bubble", "#bubble/games"]],
    ["the same rooms in another order", ["#bubble/games", "#bubble"]],
  ])("sends nothing when it follows %s", (_, again) => {
    const t = guestIn(["#bubble", "#bubble/games"]);
    t.link.follow(again);
    expect(t.fake.sent).toEqual(["JOIN #bubble,#bubble/games"]);
  });

  it("joins a room given twice once", () => {
    expect(guestIn(["#bubble", "#bubble"]).fake.sent).toEqual(["JOIN #bubble"]);
  });

  it("joins a room again after it parted it", () => {
    const t = guestIn(["#bubble"]);
    t.link.follow([]);
    t.link.follow(["#bubble"]);
    expect(t.fake.sent).toEqual(["JOIN #bubble", "PART #bubble", "JOIN #bubble"]);
  });

  it("sends nothing while it waits, and joins on the next connection only what it follows then", () => {
    const t = guestIn(["#a"]);
    t.fake.state("waiting");
    t.link.follow(["#b"]);
    expect(t.fake.sent).toEqual(["JOIN #a"]);
    t.connected();
    expect(t.fake.sent).toEqual(["JOIN #a", "JOIN #b"]);
  });

  it("joins at its connection the rooms it was given before", () => {
    const t = setup();
    t.signedOut();
    t.link.follow(["#a"]);
    expect(t.connected().sent).toEqual(["JOIN #a"]);
  });

  it(`follows and joins ${String(ROOMS_JOINED)} rooms at most, Ergo's limit a client, the first listed`, () => {
    expect(ROOMS_JOINED).toBe(100);
    const rooms = Array.from({ length: 120 }, (_, n) => `#bubble/r${String(n).padStart(3, "0")}`);
    const t = guestIn(rooms);
    expect(joinedBy(t.fake.sent, "JOIN")).toEqual(rooms.slice(0, 100));
    expect(Object.keys(t.chat().rooms)).toEqual(rooms.slice(0, 100));
  });

  // Found by 4b's pre-merge: ?room= may name any room listed, the 101st too, which nothing joined.
  it("joins the room shown though it is listed past the hundredth, leaving the hundredth, and asks its history", () => {
    const rooms = Array.from({ length: 120 }, (_, n) => `#bubble/r${String(n).padStart(3, "0")}`);
    const t = guestIn(rooms);
    t.fake.sent.length = 0;
    t.link.show("#bubble/r110");
    expect(t.fake.sent).toEqual(["PART #bubble/r099", "JOIN #bubble/r110"]);
    t.fake.line(`:${GUEST}!u@h JOIN #bubble/r110`);
    expect(t.fake.sent.at(-1)).toBe("CHATHISTORY LATEST #bubble/r110 * 200");
    expect(Object.keys(t.chat().rooms)).toHaveLength(100);
    expect(Object.keys(t.chat().rooms)).toContain("#bubble/r110");
  });

  it("follows the room shown before it connects, though listed past the hundredth", () => {
    const rooms = Array.from({ length: 120 }, (_, n) => `#bubble/r${String(n).padStart(3, "0")}`);
    const t = setup();
    t.link.follow(rooms);
    t.link.show("#bubble/r110");
    t.signedOut();
    const joined = joinedBy(t.connected().sent, "JOIN");
    expect(joined).toHaveLength(100);
    expect(joined).toContain("#bubble/r110");
    expect(joined).not.toContain("#bubble/r099");
  });

  // "JOIN " and 60 rooms of 7 characters with 59 commas: 5 + 420 + 59 = 484; a room of 26 more and its
  // comma make 511.
  it.each([
    ["exactly 510 bytes in one line", 25, 1],
    ["511 bytes in two lines", 26, 2],
  ])("sends %s", (_, extra, count) => {
    const rooms = [
      ...Array.from({ length: 60 }, (_, n) => `#b/r${String(n).padStart(3, "0")}`),
      `#${"x".repeat(extra - 1)}`,
    ];
    const t = guestIn(rooms);
    expect(t.fake.sent).toHaveLength(count);
    for (const line of t.fake.sent) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(510);
    expect(joinedBy(t.fake.sent, "JOIN")).toEqual(rooms);
  });

  it("splits its PART of many long rooms into lines of 510 bytes at most", () => {
    const rooms = Array.from({ length: 100 }, (_, n) => `#bubble/${"r".repeat(40)}${String(n).padStart(3, "0")}`);
    const t = guestIn(rooms);
    t.fake.sent.length = 0;
    t.link.follow([]);
    expect(t.fake.sent.length).toBeGreaterThan(1);
    for (const line of t.fake.sent) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(510);
    expect(joinedBy(t.fake.sent, "PART")).toEqual(rooms);
  });

  it("follows only room ids: a space, a comma or a line break never reaches a JOIN", () => {
    const t = guestIn(["#ok", "#a b", "#c,#d", "#e\r\nQUIT", "nohash", "#UPPER"]);
    expect(t.fake.sent).toEqual(["JOIN #ok"]);
    expect(Object.keys(t.chat().rooms)).toEqual(["#ok"]);
  });
});

// The history of the room in view alone: Ergo paces a client to 2 lines a second past a burst of 5
// (deploy/ergo/ircd.yaml.tmpl), so a page per room joined would keep the one in view waiting (plan §4).
describe("the chat's link: the history of the room in view", () => {
  const history = (fake: Fake) => fake.sent.filter((line) => line.startsWith("CHATHISTORY "));

  it("asks the history of the room shown when Ergo says I joined it, and of no other", () => {
    const t = guestIn(["#a", "#b"]);
    t.fake.line(`:${GUEST}!u@h JOIN #a`);
    t.fake.line(`:${GUEST}!u@h JOIN #b`);
    expect(history(t.fake)).toEqual(["CHATHISTORY LATEST #a * 200"]);
  });

  it("asks a joined room's history once it is shown, once a connection", () => {
    const t = guestIn(["#a", "#b"]);
    t.fake.line(`:${GUEST}!u@h JOIN #a`);
    t.fake.line(`:${GUEST}!u@h JOIN #b`);
    t.link.show("#b");
    t.link.show("#a");
    t.link.show("#b");
    expect(history(t.fake)).toEqual(["CHATHISTORY LATEST #a * 200", "CHATHISTORY LATEST #b * 200"]);
  });

  it("waits for Ergo's JOIN of a room shown before it is joined", () => {
    const t = guestIn(["#a", "#b"]);
    t.link.show("#b");
    t.fake.line(`:${GUEST}!u@h JOIN #a`);
    expect(history(t.fake)).toEqual([]);
    t.fake.line(`:${GUEST}!u@h JOIN #b`);
    expect(history(t.fake)).toEqual(["CHATHISTORY LATEST #b * 200"]);
  });

  it.each([
    ["a room it does not follow", "#garden"],
    ["no room", undefined],
  ])("asks nothing when shown %s", (_, room) => {
    const t = guestIn(["#a"]);
    t.fake.line(`:${GUEST}!u@h JOIN #a`);
    t.fake.sent.length = 0;
    t.link.show(room);
    t.link.show(room);
    expect(t.fake.sent).toEqual([]);
  });

  // F768: with Ergo's multiclient, a second tab of an account already in a room gets no echo of its own JOIN
  // (Ergo's channel.go answers nothing); Ergo told it of the room before, at its welcome or when the first joined.
  it("asks a room's history though its own JOIN brings no echo, Ergo having said before that I am in it", () => {
    const t = guestIn([]);
    t.fake.line(`:${GUEST}!u@h JOIN #a`);
    expect(history(t.fake)).toEqual([]);
    t.link.follow(["#a"]);
    t.link.show("#a");
    expect(t.fake.sent).toEqual(["JOIN #a", "CHATHISTORY LATEST #a * 200", "NAMES #a"]);
  });

  it("asks who is here only when its own JOIN brought no one: Ergo's NAMES follow a JOIN it echoes", () => {
    const t = guestIn(["#a"]);
    t.fake.line(`:${GUEST}!u@h JOIN #a`);
    expect(t.fake.sent).toEqual(["JOIN #a", "CHATHISTORY LATEST #a * 200"]);
  });

  it("parts no room Ergo says I am in that it never joined: another tab's", () => {
    const t = guestIn(["#a"]);
    t.fake.line(`:${GUEST}!u@h JOIN #b`);
    t.link.follow([]);
    expect(t.fake.sent).toEqual(["JOIN #a", "PART #a"]);
  });

  it("asks nothing while it waits, and asks the room shown again on the next connection's JOIN", () => {
    const t = guestIn(["#a"]);
    t.fake.line(`:${GUEST}!u@h JOIN #a`);
    t.fake.state("waiting");
    t.link.show("#a");
    expect(history(t.fake)).toHaveLength(1);
    t.connected();
    t.fake.line(`:${GUEST}!u@h JOIN #a`);
    expect(history(t.fake)).toHaveLength(2);
  });

  it("asks a room's history again once it was parted and joined again", () => {
    const t = guestIn(["#a"]);
    t.fake.line(`:${GUEST}!u@h JOIN #a`);
    t.link.follow([]);
    t.link.follow(["#a"]);
    t.fake.line(`:${GUEST}!u@h JOIN #a`);
    expect(history(t.fake)).toHaveLength(2);
  });

  it("shows nothing more once stopped, though its connection would still send", () => {
    const t = guestIn(["#a", "#b"]);
    t.fake.line(`:${GUEST}!u@h JOIN #b`);
    t.link.stop();
    t.fake.connected = true;
    t.link.show("#b");
    expect(history(t.fake)).toEqual([]);
  });

  it("asks once though Ergo says twice I joined the room shown", () => {
    const t = guestIn(["#a"]);
    t.fake.line(`:${GUEST}!u@h JOIN #a`);
    t.fake.line(`:${GUEST}!u@h JOIN #a`);
    expect(history(t.fake)).toHaveLength(1);
  });

  it("forgets the room shown when shown none", () => {
    const t = guestIn(["#a"]);
    t.link.show(undefined);
    t.fake.line(`:${GUEST}!u@h JOIN #a`);
    expect(history(t.fake)).toEqual([]);
  });

  it("takes my JOIN replayed in a batch of another type for no join, and asks nothing when the room is shown", () => {
    const t = guestIn(["#a", "#b"]);
    t.fake.line("BATCH +n1 netjoin");
    t.fake.line(`@batch=n1 :${GUEST}!u@h JOIN #b`);
    t.fake.line("BATCH -n1");
    t.link.show("#b");
    expect(history(t.fake)).toEqual([]);
  });

  it("asks nothing for a room it stopped following, though Ergo had said I joined it", () => {
    const t = guestIn(["#a", "#b"]);
    t.fake.line(`:${GUEST}!u@h JOIN #b`);
    t.link.follow(["#a"]);
    t.fake.sent.length = 0;
    t.link.show("#b");
    expect(t.fake.sent).toEqual([]);
  });
});

describe("the chat's link: lines of mine that are no JOIN", () => {
  it.each([
    ["a line of mine", `@msgid=a;time=${T0} :${GUEST}!u@h PRIVMSG #a :hi`],
    ["a MODE of mine", `:${GUEST}!u@h MODE #a +i`],
  ])("asks no history for %s in a room it sent a JOIN for", (_, text) => {
    const t = guestIn(["#a"]);
    t.fake.line(text);
    expect(t.fake.sent).toEqual(["JOIN #a"]);
  });

  it("joins nothing when it connects following no room", () => {
    const t = setup();
    t.signedOut();
    expect(t.connected().sent).toEqual([]);
  });
});

describe("the chat's link: what Ergo says", () => {
  it(`asks a room's newest ${String(HISTORY_LINES)} lines when Ergo says I joined it`, () => {
    expect(HISTORY_LINES).toBe(200);
    const t = guestIn(["#bubble"]);
    t.fake.line(`:${GUEST}!u@h JOIN #bubble`);
    expect(t.fake.sent.at(-1)).toBe("CHATHISTORY LATEST #bubble * 200");
    expect(t.room("#bubble")?.members).toEqual([GUEST]);
  });

  it("asks the history on my extended JOIN too", () => {
    const t = guestIn(["#bubble"]);
    t.fake.line(`:${GUEST}!u@h JOIN #bubble * :Guest`);
    expect(t.fake.sent.at(-1)).toBe("CHATHISTORY LATEST #bubble * 200");
  });

  it.each([
    ["someone else's JOIN", ":alice!u@h JOIN #bubble"],
    ["the JOIN of a nick that starts as mine", `:${GUEST}2!u@h JOIN #bubble`],
    ["my JOIN of a room it does not follow", `:${GUEST}!u@h JOIN #garden`],
    ["a JOIN with no source", "JOIN #bubble"],
    ["my JOIN with no room", `:${GUEST}!u@h JOIN`],
    ["Ergo refusing a JOIN, invite only (473)", `:ergo 473 ${GUEST} #bubble :Cannot join channel (+i)`],
    ["Ergo refusing a JOIN, too many rooms (405)", `:ergo 405 ${GUEST} #bubble :You have joined too many channels`],
  ])("asks no history for %s, and never throws", (_, text) => {
    const t = guestIn(["#bubble"]);
    expect(() => {
      t.fake.line(text);
    }).not.toThrow();
    expect(t.fake.sent).toEqual(["JOIN #bubble"]);
  });

  it("asks no history for my JOIN replayed in a history batch, during it or at its end", () => {
    const t = guestIn(["#bubble"]);
    t.fake.line("BATCH +h1 chathistory #bubble");
    t.fake.line(`@batch=h1 :${GUEST}!u@h JOIN #bubble`);
    t.fake.line("BATCH -h1");
    expect(t.fake.sent).toEqual(["JOIN #bubble"]);
  });

  it("asks no history for 10,000 live lines", () => {
    const t = guestIn(["#bubble"]);
    for (let n = 0; n < 10_000; n += 1) t.fake.line(live("#bubble", `m${String(n)}`, "x"));
    expect(t.fake.sent).toEqual(["JOIN #bubble"]);
  });

  it("hands a live line to the store", () => {
    const t = guestIn(["#bubble"]);
    t.fake.line(live("#bubble", "a", "hello"));
    expect(t.room("#bubble")?.lines.map((line) => line.text)).toEqual(["hello"]);
  });

  it("hands a history page to the store at its end, at once", () => {
    const t = guestIn(["#bubble"]);
    t.fake.line("BATCH +h1 chathistory #bubble");
    t.fake.line(`@batch=h1;msgid=a;time=${T0} :alice!u@h PRIVMSG #bubble :one`);
    t.fake.line(`@batch=h1;msgid=b;time=${T0} :alice!u@h PRIVMSG #bubble :two`);
    expect(t.room("#bubble")?.lines).toEqual([]);
    let told = 0;
    const unsubscribe = t.store.subscribe(() => {
      told += 1;
    });
    t.fake.line("BATCH -h1");
    unsubscribe();
    expect(told).toBe(1);
    expect(t.room("#bubble")?.lines.map((line) => line.text)).toEqual(["one", "two"]);
  });

  it.each([
    ["names no room", "BATCH +h1 chathistory"],
    ["is of a room it does not follow", "BATCH +h1 chathistory #garden"],
  ])("changes nothing for a history page that %s, and reads the lines after it", (_, open) => {
    const t = guestIn(["#bubble"]);
    t.fake.line(open);
    t.fake.line(`@batch=h1;msgid=a;time=${T0} :alice!u@h PRIVMSG #bubble :lost`);
    t.fake.line("BATCH -h1");
    t.fake.line("BATCH -zz");
    expect(t.room("#bubble")?.lines).toEqual([]);
    t.fake.line(live("#bubble", "b", "after"));
    expect(t.room("#bubble")?.lines.map((line) => line.text)).toEqual(["after"]);
    expect(t.fake.sent).toEqual(["JOIN #bubble"]);
  });

  it("hands each line of a batch of another type to the store as it would a live one, at the batch's end", () => {
    const t = guestIn(["#bubble"]);
    t.fake.line("BATCH +n1 netjoin");
    t.fake.line(`@batch=n1;msgid=a;time=${T0} :alice!u@h PRIVMSG #bubble :inside`);
    expect(t.room("#bubble")?.lines).toEqual([]);
    t.fake.line("BATCH -n1");
    expect(t.room("#bubble")?.lines.map((line) => line.text)).toEqual(["inside"]);
  });
});

describe("the chat's link: drops and reconnects", () => {
  it.each(["connecting", "waiting", "stopped"] as const)(
    "shows %s, forgets my nick and who is here, and keeps the lines",
    (state) => {
      const t = guestIn(["#bubble"]);
      t.fake.line(`:${GUEST}!u@h JOIN #bubble`);
      t.fake.line(live("#bubble", "a", "kept"));
      t.fake.state(state);
      expect(t.store.getState().login.chat).toBe(state);
      expect(t.chat().me).toBeUndefined();
      expect(t.room("#bubble")?.members).toEqual([]);
      expect(t.room("#bubble")?.lines.map((line) => line.text)).toEqual(["kept"]);
    },
  );

  // A batch never spans connections: each connected starts a new reader.
  it("starts each connection's batches afresh: one left open by a drop holds no line of the next", () => {
    const t = guestIn(["#bubble"]);
    t.fake.line("BATCH +h1 chathistory #bubble");
    t.fake.state("waiting");
    t.connected();
    t.fake.line(`@batch=h1;msgid=a;time=${T0} :alice!u@h PRIVMSG #bubble :after`);
    expect(t.room("#bubble")?.lines.map((line) => line.text)).toEqual(["after"]);
  });

  it("joins its rooms again after a reconnect, and asks their history again, which the store dedupes", () => {
    const t = guestIn(["#bubble"]);
    t.fake.line(`:${GUEST}!u@h JOIN #bubble`);
    t.fake.line(live("#bubble", "a", "one"));
    t.fake.state("waiting");
    t.fake.state("connecting");
    t.connected();
    expect(t.fake.sent.filter((line) => line === "JOIN #bubble")).toHaveLength(2);
    t.fake.line(`:${GUEST}!u@h JOIN #bubble`);
    expect(t.fake.sent.filter((line) => line.startsWith("CHATHISTORY"))).toHaveLength(2);
    t.fake.line("BATCH +h2 chathistory #bubble");
    t.fake.line(`@batch=h2;msgid=a;time=${T0} :alice!u@h PRIVMSG #bubble :one`);
    t.fake.line("BATCH -h2");
    expect(t.room("#bubble")?.lines.map((line) => line.id)).toEqual(["a"]);
  });

  it("stops for good: its connection stopped, the store told it is off, nothing heard or sent after", () => {
    const t = guestIn(["#bubble"]);
    t.link.stop();
    t.link.stop();
    expect(t.fake.stopped).toBe(true);
    expect(t.store.getState().login.chat).toBe("off");
    expect(t.chat().me).toBeUndefined();
    t.fake.line(live("#bubble", "a", "late"));
    t.link.follow(["#garden"]);
    t.signedIn(ADDRESS);
    expect(t.links).toHaveLength(1);
    expect(t.room("#bubble")?.lines).toEqual([]);
    expect(t.fake.sent).toEqual(["JOIN #bubble"]);
  });

  it("stops before any session, and opens none after", () => {
    const t = setup();
    t.link.stop();
    t.signedOut();
    expect(t.links).toHaveLength(0);
  });
});
