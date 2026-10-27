import { readFileSync } from "node:fs";
import { parseLine, type IrcMessage } from "@gnoworld/core";
import { Address } from "@gnoworld/schemas";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Result } from "../../lib/api/http.ts";
import type { Ergo, ErgoState, Who } from "../../lib/ergo/ergo.ts";
import { createAppStore } from "../../store/index.ts";
import { totalUnseen, unseenNotices } from "../../store/notices.ts";
import { HISTORY_RING } from "./history.ts";
import { chatLink, HISTORY_LINES, ROOMS_JOINED, type LinkDeps } from "./link.ts";
import { WAITING } from "./outbox.ts";

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

const setup = (before?: (store: ReturnType<typeof createAppStore>) => void, device?: LinkDeps["device"]) => {
  const store = createAppStore();
  before?.(store);
  const links: Fake[] = [];
  const asked = { tickets: 0, guests: 0 };
  const link = chatLink({
    store,
    device,
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

  // 4e's late test audit (T1): an account's conversations must not follow it into the next session's page.
  it.each([
    [
      "nobody logged in",
      (t: Setup) => {
        t.signedOut();
      },
    ],
    [
      "another account",
      (t: Setup) => {
        t.signedIn(OTHER);
      },
    ],
  ])("starts a new session, %s, with no direct message: the last account's not kept", (_, next) => {
    const t = setup();
    t.signedIn(ADDRESS);
    t.connected(ADDRESS);
    t.last().line(`@msgid=d;time=${T0};account=${OTHER} :${OTHER}!u@h PRIVMSG ${ADDRESS} :for you alone`);
    expect(Object.keys(t.store.getState().dms)).toEqual([OTHER]);
    next(t);
    expect(t.store.getState().dms).toEqual({});
  });

  // 4e's complexity review: the account's direct-message choices, read from its device by the store at its start.
  it("hands the store the device of each account's session, and none of a guest's", () => {
    const asked: string[] = [];
    const t = setup(undefined, (account) => {
      asked.push(account);
      return {
        prefs: { onlyKnown: () => true, setOnlyKnown: () => true, known: () => [OTHER], setKnown: () => true },
        drafts: { get: () => "", set: () => true },
      };
    });
    t.signedIn(ADDRESS);
    expect(t.store.getState().dmChoices).toEqual({ onlyKnown: true, known: new Set([OTHER]) });
    t.signedOut();
    expect(t.store.getState().dmChoices).toEqual({ onlyKnown: false, known: new Set() });
    expect(asked).toEqual([ADDRESS]);
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

describe("the chat's link: what it says", () => {
  // An account's link following these rooms, the first shown, connected, and in the first once Ergo said so.
  const memberIn = (rooms: readonly string[]) => {
    const t = setup();
    t.link.follow(rooms);
    t.link.show(rooms[0]);
    t.signedIn(ADDRESS);
    const fake = t.connected(ADDRESS);
    fake.line(`:${ADDRESS}!u@h JOIN ${rooms[0] ?? ""}`);
    return { ...t, fake };
  };
  const said = (sent: readonly string[]) => sent.filter((line) => line.startsWith("PRIVMSG "));

  it("sends a draft to a room it is in, as the composer composes it", () => {
    const t = memberIn(["#bubble/games"]);
    expect(t.link.say("#bubble/games", "  hi **all**  ")).toBe(true);
    expect(t.link.say("#bubble/games", "/me waves")).toBe(true);
    expect(said(t.fake.sent)).toEqual([
      "PRIVMSG #bubble/games :hi **all**",
      "PRIVMSG #bubble/games :\u0001ACTION waves\u0001",
    ]);
  });

  it.each(["", "  ", "/nick bob", "a".repeat(600)])(
    "sends nothing of a draft the composer would not send (%j)",
    (draft) => {
      const t = memberIn(["#bubble/games"]);
      expect(t.link.say("#bubble/games", draft)).toBe(false);
      expect(said(t.fake.sent)).toEqual([]);
    },
  );

  // 4c's message menu (docs/decisions.md, 2026-10-26): Delete on one's own line, Ergo's REDACT (draft/message-
  // redaction, allow-individual-delete), which Ergo refuses for another's line.
  const redacted = (sent: readonly string[]) => sent.filter((line) => line.startsWith("REDACT "));

  // Ergo's msgid: 26 characters of base32 (irc/utils/crypto.go's GenerateSecretToken).
  const MSGID = "rmq4xvjw9ys5pwtqqjxbqwvhjc";

  it("deletes a line of a room it is in by its msgid, as Ergo's REDACT", () => {
    const t = memberIn(["#bubble/games"]);
    expect(t.link.redact("#bubble/games", MSGID)).toBe(true);
    expect(redacted(t.fake.sent)).toEqual([`REDACT #bubble/games ${MSGID}`]);
  });

  it("deletes nothing in a room Ergo has not said it is in, nor in one it left", () => {
    const t = memberIn(["#bubble/games", "#bubble"]);
    expect(t.link.redact("#bubble", MSGID)).toBe(false);
    t.link.follow(["#bubble"]);
    expect(t.link.redact("#bubble/games", MSGID)).toBe(false);
    expect(redacted(t.fake.sent)).toEqual([]);
  });

  it("deletes nothing as a guest, whose lines no account wrote", () => {
    const g = guestIn(["#bubble/games"]);
    g.fake.line(`:${GUEST}!u@h JOIN #bubble/games`);
    expect(g.link.redact("#bubble/games", MSGID)).toBe(false);
    expect(redacted(g.fake.sent)).toEqual([]);
  });

  // The red pass (M9): what holds say holds redact.
  it("deletes nothing in a room Ergo kicked it from", () => {
    const t = memberIn(["#bubble/games"]);
    t.fake.line(`:op!u@h KICK #bubble/games ${ADDRESS} :bye`);
    expect(t.link.redact("#bubble/games", MSGID)).toBe(false);
    expect(redacted(t.fake.sent)).toEqual([]);
  });

  it("deletes nothing while away, nothing again before Ergo says it is in the room, and nothing once stopped", () => {
    const t = memberIn(["#bubble/games"]);
    t.fake.state("waiting");
    expect(t.link.redact("#bubble/games", MSGID)).toBe(false);
    const again = t.connected(ADDRESS);
    expect(t.link.redact("#bubble/games", MSGID)).toBe(false);
    again.line(`:${ADDRESS}!u@h JOIN #bubble/games`);
    expect(t.link.redact("#bubble/games", MSGID)).toBe(true);
    t.link.stop();
    expect(t.link.redact("#bubble/games", MSGID)).toBe(false);
    expect(redacted(again.sent)).toEqual([`REDACT #bubble/games ${MSGID}`]);
  });

  // The green pass (G13): the rule's bound itself, 64 characters, goes out.
  it("deletes by a msgid of 64 characters, the rule's longest", () => {
    const t = memberIn(["#bubble/games"]);
    const id = "a".repeat(64);
    expect(t.link.redact("#bubble/games", id)).toBe(true);
    expect(redacted(t.fake.sent)).toEqual([`REDACT #bubble/games ${id}`]);
  });

  // The red pass (M10): a msgid comes from a line's tags; one that is no single word never reaches the wire.
  it.each([
    ["nothing", ""],
    ["a space", "a b"],
    ["a CR LF and a second command", "a\r\nPRIVMSG #bubble/games :x"],
    ["an LF", "a\nQUIT"],
    ["a CR", "a\rQUIT"],
    ["a NUL", "a\u0000b"],
    ["a comma", "a,b"],
    ["a leading colon", ":a"],
    // The green pass (G2): what a command splits on, leading too, and one character past 64.
    ["a leading space", " a"],
    ["a leading comma", ",a"],
    ["a tab", "a\tb"],
    ["a leading tab", "\ta"],
    ["a leading CR", "\ra"],
    ["a leading LF", "\na"],
    ["a leading NUL", "\u0000a"],
    ["65 characters", "a".repeat(65)],
    ["600 characters", "a".repeat(600)],
    // The green pass (G13): one past the rule's bound.
    ["65 characters", "a".repeat(65)],
  ])("sends no REDACT for a msgid holding %s", (_, id) => {
    const t = memberIn(["#bubble/games"]);
    const before = t.fake.sent.length;
    expect(t.link.redact("#bubble/games", id)).toBe(false);
    expect(t.fake.sent.slice(before)).toEqual([]);
  });

  it("deletes by a msgid of 64 characters, the longest a line's tags give", () => {
    const t = memberIn(["#bubble/games"]);
    expect(t.link.redact("#bubble/games", "a".repeat(64))).toBe(true);
    expect(redacted(t.fake.sent)).toEqual([`REDACT #bubble/games ${"a".repeat(64)}`]);
  });

  it("says nothing as a guest: a room lets accounts alone speak", () => {
    const t = guestIn(["#bubble/games"]);
    t.fake.line(`:${GUEST}!u@h JOIN #bubble/games`);
    expect(t.link.say("#bubble/games", "hi")).toBe(false);
    expect(said(t.fake.sent)).toEqual([]);
  });

  it("says nothing in a room Ergo has not said it is in, nor in one it left", () => {
    const t = memberIn(["#bubble/games", "#bubble"]);
    expect(t.link.say("#bubble", "hi")).toBe(false);
    expect(t.link.say("#garden", "hi")).toBe(false);
    t.link.follow(["#bubble"]);
    expect(t.link.say("#bubble/games", "hi")).toBe(false);
    expect(said(t.fake.sent)).toEqual([]);
  });

  it("says nothing in a room Ergo kicked it from, though a kick of the past replays", () => {
    const t = memberIn(["#bubble/games", "#bubble"]);
    t.fake.line(`:${ADDRESS}!u@h JOIN #bubble`);
    t.fake.line("BATCH +n1 example.com/replay");
    t.fake.line(`@batch=n1 :op!u@h KICK #bubble ${ADDRESS} :long ago`);
    t.fake.line("BATCH -n1");
    expect(t.link.say("#bubble", "hi")).toBe(true);
    t.fake.line(`:op!u@h KICK #bubble/games ${ADDRESS} :bye`);
    t.fake.line(`:op!u@h KICK #bubble ${OTHER} :not me`);
    expect(t.link.say("#bubble/games", "hi")).toBe(false);
    expect(t.link.say("#bubble", "again")).toBe(true);
    expect(said(t.fake.sent)).toEqual(["PRIVMSG #bubble :hi", "PRIVMSG #bubble :again"]);
  });

  // The security review (4f's S1): Ergo's PART of the account, another session leaving the room (channel.go:1078-1082,
  // v2.19.1), takes every session out of it, as a KICK does; a PART of the past or of another is no such thing.
  it("says nothing, tells no typing and marks nothing in a room another session of the account left", () => {
    const t = memberIn(["#bubble/games", "#bubble"]);
    t.fake.line(`:${ADDRESS}!u@h JOIN #bubble`);
    t.fake.line(`@msgid=m1;time=2026-10-25T10:01:00.000Z :alice!u@h PRIVMSG #bubble/games :one`);
    t.fake.line("BATCH +p1 example.com/replay");
    t.fake.line(`@batch=p1 :${ADDRESS}!u@h PART #bubble :long ago`);
    t.fake.line("BATCH -p1");
    t.fake.line(`:${OTHER}!u@h PART #bubble`);
    expect(t.link.say("#bubble", "still in")).toBe(true);
    t.fake.line(`:${ADDRESS}!u@h PART #bubble/games`);
    t.link.typing("#bubble/games", "active");
    t.link.read("#bubble/games", "m1");
    expect(t.link.say("#bubble/games", "still here?")).toBe(false);
    expect(
      t.fake.sent.filter((line) => / TAGMSG |^MARKREAD \S+ timestamp=|^PRIVMSG #bubble\/games/.test(line)),
    ).toEqual([]);
  });

  it("takes no line of another for a KICK of it, though the line names it", () => {
    const t = memberIn(["#bubble/games"]);
    t.fake.line(`:troll!u@h PRIVMSG #bubble/games :${ADDRESS}`);
    t.fake.line(`:troll!u@h NOTICE #bubble/games ${ADDRESS}`);
    expect(t.link.say("#bubble/games", "still here")).toBe(true);
  });

  it("forgets, as a connection drops, the rooms it had joined: the next one parts none of them", () => {
    const t = guestIn(["#a", "#b"]);
    t.fake.state("waiting");
    t.link.follow(["#a"]);
    const again = t.connected();
    const before = again.sent.length;
    t.link.follow(["#a"]);
    expect(again.sent.slice(before).filter((line) => line.startsWith("PART"))).toEqual([]);
    expect(joinedBy(again.sent, "PART")).toEqual([]);
  });

  it("says nothing while away, nothing again before Ergo says it is in the room, and nothing once stopped", () => {
    const t = memberIn(["#bubble/games"]);
    t.fake.state("waiting");
    expect(t.link.say("#bubble/games", "away")).toBe(false);
    const again = t.connected(ADDRESS);
    expect(t.link.say("#bubble/games", "early")).toBe(false);
    again.line(`:${ADDRESS}!u@h JOIN #bubble/games`);
    expect(t.link.say("#bubble/games", "back")).toBe(true);
    t.link.stop();
    expect(t.link.say("#bubble/games", "late")).toBe(false);
    expect(said(again.sent)).toEqual(["PRIVMSG #bubble/games :back"]);
  });

  // 4f: who is typing (IRCv3's +typing, ircv3.net/specs/client-tags/typing).
  describe("typing", () => {
    const tagged = (sent: readonly string[]) => sent.filter((line) => line.includes(" TAGMSG "));
    afterEach(() => {
      vi.useRealTimers();
    });

    it("tells the room the account is typing, at most once every 3 s, as the spec throttles it", () => {
      vi.useFakeTimers({ now: Date.parse(T0) });
      const t = memberIn(["#bubble/games"]);
      t.link.typing("#bubble/games", "active");
      vi.advanceTimersByTime(2_999);
      t.link.typing("#bubble/games", "active");
      expect(tagged(t.fake.sent)).toEqual(["@+typing=active TAGMSG #bubble/games"]);
      vi.advanceTimersByTime(1);
      t.link.typing("#bubble/games", "active");
      expect(tagged(t.fake.sent)).toHaveLength(2);
    });

    it("throttles each room apart", () => {
      vi.useFakeTimers({ now: Date.parse(T0) });
      const t = memberIn(["#bubble/games", "#bubble"]);
      t.fake.line(`:${ADDRESS}!u@h JOIN #bubble`);
      t.link.typing("#bubble/games", "active");
      t.link.typing("#bubble", "active");
      expect(tagged(t.fake.sent)).toEqual(["@+typing=active TAGMSG #bubble/games", "@+typing=active TAGMSG #bubble"]);
    });

    it("tells the room the account is done once, and only after it said it was typing", () => {
      vi.useFakeTimers({ now: Date.parse(T0) });
      const t = memberIn(["#bubble/games"]);
      t.link.typing("#bubble/games", "done");
      t.link.typing("#bubble/games", "active");
      t.link.typing("#bubble/games", "done");
      t.link.typing("#bubble/games", "done");
      // Typed on: a done may wait its turn.
      vi.advanceTimersByTime(3_000);
      expect(tagged(t.fake.sent)).toEqual([
        "@+typing=active TAGMSG #bubble/games",
        "@+typing=done TAGMSG #bubble/games",
      ]);
    });

    // The code review (CR5), in place of the red pass's R23 (the throttle reset on a done): a field cleared and written
    // again within the 3 s keeps the typing shown, its readers' 6 s running, and tells nothing more; clearing it and
    // writing again over and over sends one TAGMSG each 3 s, never two a cycle.
    it("keeps the typing shown with nothing more told when a field cleared is written again within the 3 s", () => {
      vi.useFakeTimers({ now: Date.parse(T0) });
      const t = memberIn(["#bubble/games"]);
      t.link.typing("#bubble/games", "active");
      t.link.typing("#bubble/games", "done");
      t.link.typing("#bubble/games", "active");
      vi.advanceTimersByTime(3_000);
      expect(tagged(t.fake.sent)).toEqual(["@+typing=active TAGMSG #bubble/games"]);
    });

    it("tells a room one TAGMSG each 3 s however fast its field is cleared and written, the done last", () => {
      vi.useFakeTimers({ now: Date.parse(T0) });
      const t = memberIn(["#bubble/games"]);
      for (let cycle = 0; cycle < 10; cycle += 1) {
        t.link.typing("#bubble/games", "active");
        t.link.typing("#bubble/games", "done");
        vi.advanceTimersByTime(100);
      }
      expect(tagged(t.fake.sent)).toEqual(["@+typing=active TAGMSG #bubble/games"]);
      vi.advanceTimersByTime(2_000);
      expect(tagged(t.fake.sent)).toEqual([
        "@+typing=active TAGMSG #bubble/games",
        "@+typing=done TAGMSG #bubble/games",
      ]);
    });

    it("tells the typing again at once after a line said, which ends it at every reader, and owes no done", () => {
      vi.useFakeTimers({ now: Date.parse(T0) });
      const t = memberIn(["#bubble/games"]);
      t.link.typing("#bubble/games", "active");
      expect(t.link.say("#bubble/games", "hi")).toBe(true);
      t.link.typing("#bubble/games", "done");
      t.link.typing("#bubble/games", "active");
      expect(tagged(t.fake.sent)).toEqual([
        "@+typing=active TAGMSG #bubble/games",
        "@+typing=active TAGMSG #bubble/games",
      ]);
    });

    // StrykerJS's survivors on the pace: a timer for a done waiting its turn, none left once a line or a drop ends it.
    it("holds one timer for a done waiting its turn, and none once a line ends the typing or the link drops", () => {
      vi.useFakeTimers({ now: Date.parse(T0) });
      const t = memberIn(["#bubble/games"]);
      const base = vi.getTimerCount();
      t.link.typing("#bubble/games", "active");
      t.link.typing("#bubble/games", "done");
      t.link.typing("#bubble/games", "done");
      expect(vi.getTimerCount()).toBe(base + 1);
      expect(t.link.say("#bubble/games", "hi")).toBe(true);
      expect(vi.getTimerCount()).toBe(base);
      t.link.typing("#bubble/games", "active");
      t.link.typing("#bubble/games", "done");
      expect(vi.getTimerCount()).toBe(base + 1);
      t.fake.state("waiting");
      expect(vi.getTimerCount()).toBe(base);
    });

    it("tells no typing as a guest, nor in a room Ergo has not said it is in, nor after my KICK", () => {
      vi.useFakeTimers({ now: Date.parse(T0) });
      const guest = guestIn(["#bubble/games"]);
      guest.fake.line(`:${GUEST}!u@h JOIN #bubble/games`);
      guest.link.typing("#bubble/games", "active");
      expect(tagged(guest.fake.sent)).toEqual([]);
      const t = memberIn(["#bubble/games", "#bubble"]);
      t.link.typing("#bubble", "active");
      t.link.typing("#bubble/games", "active");
      t.fake.line(`:gnoworld!u@h KICK #bubble/games ${ADDRESS} :out`);
      vi.advanceTimersByTime(3_000);
      t.link.typing("#bubble/games", "active");
      expect(tagged(t.fake.sent)).toEqual(["@+typing=active TAGMSG #bubble/games"]);
    });

    // The red pass (R10): nothing counted as sent while the link is away; the first word after the JOIN goes.
    it("tells no typing while away, and tells it at once once back in the room", () => {
      vi.useFakeTimers({ now: Date.parse(T0) });
      const t = memberIn(["#bubble/games"]);
      t.fake.state("waiting");
      t.link.typing("#bubble/games", "active");
      const again = t.connected(ADDRESS);
      again.line(`:${ADDRESS}!u@h JOIN #bubble/games`);
      t.link.typing("#bubble/games", "active");
      expect(tagged(again.sent)).toEqual(["@+typing=active TAGMSG #bubble/games"]);
    });

    it("tells the typing again at once on a new connection, whose readers never heard it there", () => {
      vi.useFakeTimers({ now: Date.parse(T0) });
      const t = memberIn(["#bubble/games"]);
      t.link.typing("#bubble/games", "active");
      t.fake.state("waiting");
      const again = t.connected(ADDRESS);
      again.line(`:${ADDRESS}!u@h JOIN #bubble/games`);
      const before = again.sent.length;
      t.link.typing("#bubble/games", "active");
      expect(tagged(again.sent.slice(before))).toEqual(["@+typing=active TAGMSG #bubble/games"]);
    });
  });

  // 4f: the reading place (Ergo's draft/read-marker, ircv3.net/specs/extensions/read-marker).
  describe("the reading place", () => {
    // The places set: a MARKREAD with its time, not the ask of Ergo's (CR7).
    const marked = (sent: readonly string[]) => sent.filter((line) => /^MARKREAD \S+ timestamp=/.test(line));
    const T = (minute: number) => `2026-10-25T10:${String(minute).padStart(2, "0")}:00.000Z`;
    // A line of the room in the store, said at T(minute), its msgid m<minute>.
    const heard = (fake: Fake, room: string, minute: number) => {
      fake.line(`@msgid=m${String(minute)};time=${T(minute)} :alice!u@h PRIVMSG ${room} :at ${String(minute)}`);
    };

    it("marks the room in view read at a held line's time, as Ergo's MARKREAD, once a later line", () => {
      vi.useFakeTimers();
      const t = memberIn(["#bubble/games"]);
      heard(t.fake, "#bubble/games", 0);
      heard(t.fake, "#bubble/games", 1);
      heard(t.fake, "#bubble/games", 2);
      t.link.read("#bubble/games", "m1");
      t.link.read("#bubble/games", "m1");
      t.link.read("#bubble/games", "m0");
      t.link.read("#bubble/games", "m2");
      // Read on: a later place may wait its turn.
      vi.advanceTimersByTime(2_000);
      vi.useRealTimers();
      expect(marked(t.fake.sent)).toEqual([
        `MARKREAD #bubble/games timestamp=${T(1)}`,
        `MARKREAD #bubble/games timestamp=${T(2)}`,
      ]);
    });

    it("marks nothing at or before the reading place Ergo gave, and nothing for a guest", () => {
      const t = memberIn(["#bubble/games"]);
      heard(t.fake, "#bubble/games", 0);
      heard(t.fake, "#bubble/games", 1);
      t.fake.line(`:ergo MARKREAD #bubble/games timestamp=${T(1)}`);
      t.link.read("#bubble/games", "m1");
      t.link.read("#bubble/games", "m0");
      expect(marked(t.fake.sent)).toEqual([]);
      const guest = guestIn(["#bubble/games"]);
      guest.fake.line(`:${GUEST}!u@h JOIN #bubble/games`);
      heard(guest.fake, "#bubble/games", 1);
      guest.link.read("#bubble/games", "m1");
      expect(marked(guest.fake.sent)).toEqual([]);
    });

    // The red pass (R4): the room in view alone, and one Ergo said I am in; never another room's newest.
    it("marks no room read but the one in view, and none Ergo has not said I am in, nor after my PART or KICK", () => {
      const t = memberIn(["#bubble/games", "#bubble", "#bubble/news"]);
      heard(t.fake, "#bubble/games", 0);
      t.link.read("#bubble/games", "m0");
      t.fake.line(`:${ADDRESS}!u@h JOIN #bubble`);
      heard(t.fake, "#bubble", 1);
      t.link.read("#bubble", "m1");
      heard(t.fake, "#bubble/news", 1);
      t.link.show("#bubble/news");
      t.link.read("#bubble/news", "m1");
      t.link.show("#bubble/games");
      heard(t.fake, "#bubble/games", 1);
      t.fake.line(`:gnoworld!u@h KICK #bubble/games ${ADDRESS} :out`);
      t.link.read("#bubble/games", "m1");
      expect(marked(t.fake.sent)).toEqual([`MARKREAD #bubble/games timestamp=${T(0)}`]);
    });

    // The red pass (R5): a time Ergo would keep for good is a held line's own, never a word the caller makes.
    it.each([
      ["a line the room does not hold", "nope"],
      ["a time in place of a msgid", T(1)],
      ["a CR LF", "m1\r\nQUIT :x"],
      ["a space", "m1 extra"],
    ])("marks nothing for %s", (_, id) => {
      const t = memberIn(["#bubble/games"]);
      heard(t.fake, "#bubble/games", 1);
      t.link.read("#bubble/games", id);
      t.link.read("#bubble/games", "m1");
      expect(marked(t.fake.sent)).toEqual([`MARKREAD #bubble/games timestamp=${T(1)}`]);
    });

    // The red pass (R10): a place asked while away, or sent and never answered, goes once the room is joined again.
    it("marks the room read once back in it, what was asked while away", () => {
      const t = memberIn(["#bubble/games"]);
      heard(t.fake, "#bubble/games", 1);
      t.fake.state("waiting");
      t.link.read("#bubble/games", "m1");
      expect(marked(t.fake.sent)).toEqual([]);
      const again = t.connected(ADDRESS);
      const before = again.sent.length;
      again.line(`:${ADDRESS}!u@h JOIN #bubble/games`);
      expect(marked(again.sent.slice(before))).toEqual([`MARKREAD #bubble/games timestamp=${T(1)}`]);
    });

    it("marks the room read again on a new connection, what went on the last one unanswered", () => {
      const t = memberIn(["#bubble/games"]);
      heard(t.fake, "#bubble/games", 1);
      t.link.read("#bubble/games", "m1");
      t.fake.state("waiting");
      const again = t.connected(ADDRESS);
      const before = again.sent.length;
      again.line(`:${ADDRESS}!u@h JOIN #bubble/games`);
      expect(marked(again.sent.slice(before))).toEqual([`MARKREAD #bubble/games timestamp=${T(1)}`]);
    });

    it("marks nothing again on a new connection once Ergo answered the place", () => {
      const t = memberIn(["#bubble/games"]);
      heard(t.fake, "#bubble/games", 1);
      t.link.read("#bubble/games", "m1");
      t.fake.line(`:ergo MARKREAD #bubble/games timestamp=${T(1)}`);
      t.fake.state("waiting");
      const again = t.connected(ADDRESS);
      const before = again.sent.length;
      again.line(`:${ADDRESS}!u@h JOIN #bubble/games`);
      expect(marked(again.sent.slice(before))).toEqual([]);
    });

    // The code review (CR7): Ergo's place lost to a race (its JOIN and MARKREAD played as a second tab attached, before
    // the page followed the room) is asked of Ergo as the history is: an account's, the store holding none.
    it("asks Ergo the room's place as its history is asked, an account's, when the store holds none", () => {
      const asks = (sent: readonly string[]) => sent.filter((line) => /^MARKREAD \S+$/.test(line));
      const t = memberIn(["#bubble/games"]);
      expect(asks(t.fake.sent)).toEqual(["MARKREAD #bubble/games"]);
      const known = setup();
      known.link.follow(["#bubble/games"]);
      known.link.show("#bubble/games");
      known.signedIn(ADDRESS);
      const fake = known.connected(ADDRESS);
      fake.line(`:ergo MARKREAD #bubble/games timestamp=${T(1)}`);
      fake.line(`:${ADDRESS}!u@h JOIN #bubble/games`);
      expect(asks(fake.sent)).toEqual([]);
      const guest = guestIn(["#bubble/games"]);
      guest.fake.line(`:${GUEST}!u@h JOIN #bubble/games`);
      expect(asks(guest.fake.sent)).toEqual([]);
    });

    // The red pass (R20): an account's places are its own; another session starts with none.
    it("forgets an account's places when another session starts", () => {
      const t = memberIn(["#bubble/games"]);
      t.fake.line(`:ergo MARKREAD #bubble/games timestamp=${T(1)}`);
      expect(t.room("#bubble/games")?.read).toBe(T(1));
      t.signedIn(OTHER);
      t.link.follow(["#bubble/games"]);
      expect(t.room("#bubble/games")?.read).toBeUndefined();
      t.signedOut();
      t.link.follow(["#bubble/games"]);
      expect(t.room("#bubble/games")?.read).toBeUndefined();
    });

    // The code review (CR2) and /simplify (E1): each MARKREAD spends Ergo's fakelag once its budget of 16 is gone, so a
    // busy room read at its end must not queue the account's own lines behind them.
    describe("paced", () => {
      afterEach(() => {
        vi.useRealTimers();
      });
      const reading = () => {
        vi.useFakeTimers();
        const t = memberIn(["#bubble/games", "#bubble"]);
        for (const minute of [0, 1, 2, 3]) heard(t.fake, "#bubble/games", minute);
        return t;
      };

      it("sends a room's MARKREAD at most once each 2 s, the newest place asked following", () => {
        const t = reading();
        t.link.read("#bubble/games", "m0");
        t.link.read("#bubble/games", "m1");
        t.link.read("#bubble/games", "m2");
        expect(marked(t.fake.sent)).toEqual([`MARKREAD #bubble/games timestamp=${T(0)}`]);
        vi.advanceTimersByTime(1_999);
        expect(marked(t.fake.sent)).toHaveLength(1);
        vi.advanceTimersByTime(1);
        expect(marked(t.fake.sent)).toEqual([
          `MARKREAD #bubble/games timestamp=${T(0)}`,
          `MARKREAD #bubble/games timestamp=${T(2)}`,
        ]);
        vi.advanceTimersByTime(10_000);
        expect(marked(t.fake.sent)).toHaveLength(2);
      });

      it("sends the place waiting at once as the room in view changes, or as the page asks", () => {
        const t = reading();
        t.link.read("#bubble/games", "m0");
        t.link.read("#bubble/games", "m1");
        t.link.show("#bubble");
        expect(marked(t.fake.sent).at(-1)).toBe(`MARKREAD #bubble/games timestamp=${T(1)}`);
        t.link.show("#bubble/games");
        t.link.read("#bubble/games", "m3");
        expect(marked(t.fake.sent)).toHaveLength(2);
        t.link.flush();
        expect(marked(t.fake.sent).at(-1)).toBe(`MARKREAD #bubble/games timestamp=${T(3)}`);
        vi.advanceTimersByTime(10_000);
        expect(marked(t.fake.sent)).toHaveLength(3);
      });

      // StrykerJS's survivors on the pace: a timer a room while its place waits, none left once sent, flushed or dropped.
      it("holds one timer a room while its place waits, and none once it is sent, flushed or the link drops", () => {
        const t = reading();
        const base = vi.getTimerCount();
        t.link.read("#bubble/games", "m0");
        t.link.read("#bubble/games", "m1");
        t.link.read("#bubble/games", "m2");
        expect(vi.getTimerCount()).toBe(base + 1);
        vi.advanceTimersByTime(2_000);
        expect(vi.getTimerCount()).toBe(base);
        t.link.read("#bubble/games", "m3");
        expect(vi.getTimerCount()).toBe(base + 1);
        t.link.flush();
        expect(vi.getTimerCount()).toBe(base);
        heard(t.fake, "#bubble/games", 4);
        heard(t.fake, "#bubble/games", 5);
        t.link.read("#bubble/games", "m4");
        t.link.read("#bubble/games", "m5");
        expect(vi.getTimerCount()).toBe(base + 1);
        t.fake.state("waiting");
        expect(vi.getTimerCount()).toBe(base);
      });

      it("sends nothing waiting once the link drops, and the place at once on the next connection's JOIN", () => {
        const t = reading();
        t.link.read("#bubble/games", "m0");
        t.link.read("#bubble/games", "m2");
        t.fake.state("waiting");
        vi.advanceTimersByTime(10_000);
        expect(marked(t.fake.sent)).toEqual([`MARKREAD #bubble/games timestamp=${T(0)}`]);
        const again = t.connected(ADDRESS);
        const before = again.sent.length;
        again.line(`:${ADDRESS}!u@h JOIN #bubble/games`);
        expect(marked(again.sent.slice(before))).toEqual([`MARKREAD #bubble/games timestamp=${T(2)}`]);
      });
    });

    it("sends another session nothing the last one asked while away", () => {
      const t = memberIn(["#bubble/games"]);
      heard(t.fake, "#bubble/games", 1);
      t.fake.state("waiting");
      t.link.read("#bubble/games", "m1");
      t.signedIn(OTHER);
      t.link.follow(["#bubble/games"]);
      const again = t.connected(OTHER);
      const before = again.sent.length;
      again.line(`:${OTHER}!u@h JOIN #bubble/games`);
      expect(marked(again.sent.slice(before))).toEqual([]);
    });
  });

  // The green pass (G5-G7): the edges of what the page tells Ergo as it types and reads.
  describe("the typing and the reading place, at their edges", () => {
    const ROOM = "#bubble/games";
    const TT = (minute: number) => `2026-10-25T10:${String(minute).padStart(2, "0")}:00.000Z`;
    const spoken = (fake: Fake, minute: number) => {
      fake.line(`@msgid=m${String(minute)};time=${TT(minute)} :alice!u@h PRIVMSG ${ROOM} :at ${String(minute)}`);
    };
    afterEach(() => {
      vi.useRealTimers();
    });
    it("keeps the 3 s between two actives when a line between them could not go", () => {
      vi.useFakeTimers({ now: Date.parse(T0) });
      const t = memberIn([ROOM]);
      t.link.typing(ROOM, "active");
      expect(t.link.say(ROOM, "")).toBe(false);
      t.link.typing(ROOM, "active");
      expect(t.fake.sent.filter((line) => line.includes(" TAGMSG "))).toEqual([`@+typing=active TAGMSG ${ROOM}`]);
    });
    it("reads a room the store does not hold without a throw, and tells Ergo nothing", () => {
      const t = memberIn([ROOM]);
      expect(() => {
        t.link.read("#garden", "m1");
      }).not.toThrow();
      expect(t.fake.sent.filter((line) => /^MARKREAD \S+ timestamp=/.test(line))).toEqual([]);
    });
    it("keeps the newer place asked when an older line is read after it, through a reconnect", () => {
      const t = memberIn([ROOM]);
      spoken(t.fake, 0);
      spoken(t.fake, 1);
      t.link.read(ROOM, "m1");
      t.link.read(ROOM, "m0");
      t.fake.state("waiting");
      const again = t.connected(ADDRESS);
      const before = again.sent.length;
      again.line(`:${ADDRESS}!u@h JOIN ${ROOM}`);
      expect(again.sent.slice(before).filter((line) => /^MARKREAD \S+ timestamp=/.test(line))).toEqual([
        `MARKREAD ${ROOM} timestamp=${TT(1)}`,
      ]);
    });
  });
});

// 4e: direct messages, an account's alone; Ergo refuses a guest's to any account, which its default-user-modes set +R
// (deploy/ergo/ircd.yaml.tmpl).
describe("the chat's link: direct messages", () => {
  const account = () => {
    const t = setup();
    t.link.follow(["#bubble"]);
    t.signedIn(ADDRESS);
    return { ...t, fake: t.connected(ADDRESS) };
  };
  // A line as sent, its label (labeled-response, the link's own count) taken off; the DMs to OTHER among them.
  const unlabelled = (line: string) => line.replace(/^@label=\S+ /, "");
  const dms = (sent: readonly string[]) => sent.map(unlabelled).filter((line) => line.startsWith(`PRIVMSG ${OTHER}`));
  // The label the `at`th DM to OTHER went with: none while the link sends none.
  const labelOf = (sent: readonly string[], at: number) =>
    sent.filter((line) => unlabelled(line).startsWith(`PRIVMSG ${OTHER}`))[at]?.match(/^@label=(\S+) /)?.[1];

  // 4e's late test audit (T2): no test said the link hands Ergo's lines to the direct messages' store.
  it("hands Ergo's lines to the direct messages' store: an account's to me kept, a room's line not", () => {
    const t = account();
    t.fake.line(`@msgid=r;time=${T0};account=${OTHER} :${OTHER}!u@h PRIVMSG #bubble :to the room`);
    expect(t.store.getState().dms).toEqual({});
    t.fake.line(`@msgid=d;time=${T0};account=${OTHER} :${OTHER}!u@h PRIVMSG ${ADDRESS} :to you`);
    expect(t.store.getState().dms[OTHER]?.map(({ text }) => text)).toEqual(["to you"]);
  });

  // 4e's UX review (U1): Ergo answers 401 to a line for an account not connected (irc/handlers.go:2533, v2.19.1),
  // and its echo to one it delivered; the page emptied the box all the same, the line lost.
  // Ergo's answers carry the label of the line they answer (irc/responsebuffer.go:264-281, v2.19.1), when it had one.
  const refusal = (partner: string, label?: string) =>
    `${label === undefined ? "" : `@label=${label} `}:ergo.test 401 ${ADDRESS} ${partner} :No such nick`;
  const echo = (id: string, text: string, label?: string) =>
    `@${label === undefined ? "" : `label=${label};`}msgid=${id};time=${T0};account=${ADDRESS} :${ADDRESS}!u@h PRIVMSG ${OTHER} :${text}`;
  // An account connected, its device's drafts what the store puts back.
  const withDrafts = () => {
    const kept = new Map<string, string>();
    const t = setup(undefined, () => ({
      prefs: { onlyKnown: () => false, setOnlyKnown: () => true, known: () => [], setKnown: () => true },
      drafts: {
        get: (room) => kept.get(room) ?? "",
        set: (room, draft) => {
          kept.set(room, draft);
          return true;
        },
      },
    }));
    t.link.follow(["#bubble"]);
    t.signedIn(ADDRESS);
    return { ...t, kept, fake: t.connected(ADDRESS) };
  };
  type WithDrafts = ReturnType<typeof withDrafts>;

  it("puts back the draft of a line Ergo refused, its partner not connected, and counts it", () => {
    const t = withDrafts();
    expect(t.link.sayTo(OTHER, "  hi **you**  ")).toBe(true);
    t.fake.line(refusal(OTHER, labelOf(t.fake.sent, 0)));
    expect(t.kept.get(OTHER)).toBe("  hi **you**  ");
    expect(t.store.getState().dmRefused).toEqual({ [OTHER]: { count: 1, draft: "  hi **you**  " } });
  });

  it("puts back each line Ergo refused in turn, past one it delivered", () => {
    const t = withDrafts();
    for (const draft of ["one", "/me two", "three"]) t.link.sayTo(OTHER, draft);
    t.fake.line(echo("a", "one", labelOf(t.fake.sent, 0)));
    t.fake.line(refusal(OTHER, labelOf(t.fake.sent, 1)));
    expect(t.kept.get(OTHER)).toBe("/me two");
    // The composer sent it again, or the reader emptied the box: no draft waits.
    t.kept.set(OTHER, "");
    t.fake.line(refusal(OTHER, labelOf(t.fake.sent, 2)));
    expect(t.kept.get(OTHER)).toBe("three");
    expect(t.store.getState().dmRefused).toEqual({ [OTHER]: { count: 2, draft: "three" } });
  });

  // /code-review (CR1): Ergo answers a labeled line by its label, one line or a labeled-response batch
  // (irc/commands.go:41, responsebuffer.go:264-281, v2.19.1); the outbox matched answers by order, so a line
  // refused otherwise (a 417, a 477) stayed waiting and a later 401 put back its draft, not the 401's line's.
  it("sends each direct message with a label of its own", () => {
    const t = account();
    t.link.sayTo(OTHER, "one");
    t.link.sayTo(OTHER, "two");
    const labels = [labelOf(t.fake.sent, 0), labelOf(t.fake.sent, 1)];
    expect(labels.every((label) => label !== undefined)).toBe(true);
    expect(new Set(labels).size).toBe(2);
  });

  it("puts back the draft of the line each refusal answers, by its label, a line refused otherwise too", () => {
    const t = withDrafts();
    t.link.sayTo(OTHER, "a");
    t.link.sayTo(OTHER, "b");
    t.fake.line(`@label=${labelOf(t.fake.sent, 0) ?? ""} :ergo.test 417 ${ADDRESS} :Line too long to be relayed`);
    expect(t.kept.get(OTHER)).toBe("a");
    expect(t.store.getState().dmRefused).toEqual({ [OTHER]: { count: 1, draft: "a", offline: false } });
    t.kept.set(OTHER, "");
    t.fake.line(refusal(OTHER, labelOf(t.fake.sent, 1)));
    expect(t.kept.get(OTHER)).toBe("b");
    expect(t.store.getState().dmRefused).toEqual({ [OTHER]: { count: 2, draft: "b" } });
  });

  it("takes a labeled-response batch for its line's answer: its echo and Ergo's away line deliver it", () => {
    const t = withDrafts();
    t.link.sayTo(OTHER, "hi");
    const label = labelOf(t.fake.sent, 0) ?? "";
    t.fake.line(`@label=${label} BATCH +r1 labeled-response`);
    t.fake.line(`@batch=r1;msgid=e;time=${T0};account=${ADDRESS} :${ADDRESS}!u@h PRIVMSG ${OTHER} :hi`);
    t.fake.line(`@batch=r1 :ergo.test 301 ${ADDRESS} ${OTHER} :back soon`);
    t.fake.line("BATCH -r1");
    expect(t.store.getState().dms[OTHER]?.map(({ text }) => text)).toEqual(["hi"]);
    t.fake.line(refusal(OTHER, label));
    expect(t.store.getState().dmRefused).toEqual({});
  });

  it(`keeps ${String(WAITING)} lines waiting at most: the oldest's late answer puts nothing back`, () => {
    const t = withDrafts();
    for (let n = 0; n <= WAITING; n += 1) t.link.sayTo(OTHER, `line ${String(n)}`);
    t.fake.line(refusal(OTHER, labelOf(t.fake.sent, 0)));
    expect(t.store.getState().dmRefused).toEqual({});
    t.fake.line(refusal(OTHER, labelOf(t.fake.sent, WAITING)));
    expect(t.kept.get(OTHER)).toBe(`line ${String(WAITING)}`);
  });

  // StrykerJS on CR1's fix: a standard reply's FAIL refuses too, and the bound drops a line past 50 waiting, not at 50.
  it("puts back a line Ergo answers with a FAIL, said refused, not offline", () => {
    const t = withDrafts();
    t.link.sayTo(OTHER, "hi");
    t.fake.line(`@label=${labelOf(t.fake.sent, 0) ?? ""} :ergo.test FAIL PRIVMSG INVALID_TARGET ${OTHER} :No`);
    expect(t.kept.get(OTHER)).toBe("hi");
    expect(t.store.getState().dmRefused).toEqual({ [OTHER]: { count: 1, draft: "hi", offline: false } });
  });

  it(`keeps exactly ${String(WAITING)} lines waiting: the first one's refusal still puts it back`, () => {
    const t = withDrafts();
    for (let n = 0; n < WAITING; n += 1) t.link.sayTo(OTHER, `line ${String(n)}`);
    t.fake.line(refusal(OTHER, labelOf(t.fake.sent, 0)));
    expect(t.kept.get(OTHER)).toBe("line 0");
  });

  // With Ergo's multiclient, another tab's line reaches this one as an echo does: it answers none of this one's.
  it("takes another tab's line to the same account for no answer to its own", () => {
    const t = withDrafts();
    t.link.sayTo(OTHER, "mine");
    t.fake.line(echo("a", "from my other tab"));
    t.fake.line(refusal(OTHER, labelOf(t.fake.sent, 0)));
    expect(t.kept.get(OTHER)).toBe("mine");
  });

  it.each([
    [
      "for an account it sent nothing to",
      (t: WithDrafts) => {
        t.fake.line(refusal(OTHER));
      },
    ],
    [
      "for a line Ergo delivered",
      (t: WithDrafts) => {
        t.link.sayTo(OTHER, "hi");
        const label = labelOf(t.fake.sent, 0);
        t.fake.line(echo("a", "hi", label));
        t.fake.line(refusal(OTHER, label));
      },
    ],
    [
      "on a new connection, for the last one's line",
      (t: WithDrafts) => {
        t.link.sayTo(OTHER, "hi");
        const label = labelOf(t.fake.sent, 0);
        t.fake.state("waiting");
        t.connected(ADDRESS).line(refusal(OTHER, label));
      },
    ],
  ])("puts back nothing %s", (_, steps) => {
    const t = withDrafts();
    steps(t);
    expect(t.store.getState().dmRefused).toEqual({});
    expect([...t.kept.keys()]).toEqual([]);
  });

  // StrykerJS on 4e: what answers a line waiting on Ergo, and what does not.
  const to = (id: string, text: string) =>
    `@msgid=${id};time=${T0};account=${OTHER} :${OTHER}!u@h PRIVMSG ${ADDRESS} :${text}`;
  it.each([
    [
      "the partner's own line of the same words",
      (t: WithDrafts) => {
        t.fake.line(to("b", "hi"));
      },
    ],
    [
      "my action's echo, for a line of the same words",
      (t: WithDrafts) => {
        t.fake.line(echo("b", "\u0001ACTION hi\u0001"));
      },
    ],
  ])("answers no waiting line by %s: Ergo's refusal still puts it back", (_, heard) => {
    const t = withDrafts();
    t.link.sayTo(OTHER, "hi");
    heard(t);
    t.fake.line(refusal(OTHER, labelOf(t.fake.sent, 0)));
    expect(t.kept.get(OTHER)).toBe("hi");
  });

  it("answers a waiting action by its echo alone, and refuses nothing on a line naming the partner", () => {
    const t = withDrafts();
    t.link.sayTo(OTHER, "/me waves");
    t.fake.line(to("b", OTHER));
    expect(t.store.getState().dmRefused).toEqual({});
    const label = labelOf(t.fake.sent, 0);
    t.fake.line(echo("c", "\u0001ACTION waves\u0001", label));
    t.fake.line(refusal(OTHER, label));
    expect(t.store.getState().dmRefused).toEqual({});
  });

  it("sends an account's draft to another account, as the composer composes it", () => {
    const t = account();
    expect(t.link.sayTo(OTHER, "  hi **you**  ")).toBe(true);
    expect(t.link.sayTo(OTHER, "/me waves")).toBe(true);
    expect(dms(t.fake.sent)).toEqual([`PRIVMSG ${OTHER} :hi **you**`, `PRIVMSG ${OTHER} :\u0001ACTION waves\u0001`]);
  });

  it.each([
    ["a guest's", () => guestIn(["#bubble"])],
    [
      "an account's, while away",
      () => {
        const t = account();
        t.fake.state("waiting");
        return t;
      },
    ],
  ])("sends nothing of %s", (_, made) => {
    const t = made();
    expect(t.link.sayTo(OTHER, "hi")).toBe(false);
    expect(dms(t.fake.sent)).toEqual([]);
  });

  it.each([
    ["no address", "alice"],
    ["a room", "#bubble"],
    ["its own address", ADDRESS],
    ["an address with a wrong checksum", `${OTHER.slice(0, -1)}q`],
  ])("sends nothing to %s", (_, partner) => {
    const t = account();
    const before = t.fake.sent.length;
    expect(t.link.sayTo(partner, "hi")).toBe(false);
    expect(t.fake.sent.slice(before)).toEqual([]);
  });

  it.each(["", "  ", "/nick bob", "a".repeat(600)])(
    "sends nothing of a draft the composer would not send (%j)",
    (draft) => {
      const t = account();
      expect(t.link.sayTo(OTHER, draft)).toBe(false);
      expect(dms(t.fake.sent)).toEqual([]);
    },
  );
});

// 4d: a reaction is a TAGMSG naming the line it answers (+draft/react to add, +draft/unreact to take back, Ergo storing
// both), labelled so Ergo's answer to it is known (labeled-response). What holds say and redact holds it: an account's,
// in a room Ergo says it is in; one emoji of RGI's set, a msgid a tag may carry.
describe("the chat's link: reactions", () => {
  const MSGID = "rmq4xvjw9ys5pwtqqjxbqwvhjc";
  const memberIn = (rooms: readonly string[]) => {
    const t = setup();
    t.link.follow(rooms);
    t.link.show(rooms[0]);
    t.signedIn(ADDRESS);
    const fake = t.connected(ADDRESS);
    fake.line(`:${ADDRESS}!u@h JOIN ${rooms[0] ?? ""}`);
    return { ...t, fake };
  };
  // The tagged lines sent, each label as a star: what a label says is the link's own (F1170).
  const tagged = (sent: readonly string[]) =>
    sent.filter((line) => line.startsWith("@")).map((line) => line.replace(/^@label=[^;]+;/u, "@label=*;"));

  it("reacts to a line by its msgid with one emoji, takes the reaction back, each labelled", () => {
    const t = memberIn(["#bubble/games"]);
    expect(t.link.react("#bubble/games", { to: MSGID, emoji: "👍", on: true })).toBe(true);
    expect(t.link.react("#bubble/games", { to: MSGID, emoji: "👩🏻‍❤️‍💋‍👨🏿", on: false })).toBe(true);
    expect(tagged(t.fake.sent)).toEqual([
      `@label=*;+draft/react=👍;+reply=${MSGID} TAGMSG #bubble/games`,
      `@label=*;+draft/unreact=👩🏻‍❤️‍💋‍👨🏿;+reply=${MSGID} TAGMSG #bubble/games`,
    ]);
  });

  it.each(["🏴󠁧󠁢󠁥󠁮󠁧󠁿", "🧑‍🦰", "1️⃣"])("reacts with the emoji %s whole", (emoji) => {
    const t = memberIn(["#bubble/games"]);
    expect(t.link.react("#bubble/games", { to: MSGID, emoji: emoji, on: true })).toBe(true);
    expect(tagged(t.fake.sent)).toEqual([`@label=*;+draft/react=${emoji};+reply=${MSGID} TAGMSG #bubble/games`]);
  });

  it.each([
    ["words", "nice"],
    ["two emoji", "👍👍"],
    ["two emoji joined by a ZWJ into no sequence of RGI's", "👍‍😂"],
    ["a skin tone on an emoji that takes none", "🙂🏽"],
    ["an emoji under a combining accent", "👍́"],
    ["a smile in its text form", "☺︎"],
    ["a tag's separator and a second tag", "👍;+typing=active"],
    ["a space and a second command", "👍 TAGMSG #bubble :x"],
    ["a CR LF and a second command", "👍\r\nQUIT"],
    ["nothing", ""],
  ])("sends no reaction of %s", (_, emoji) => {
    const t = memberIn(["#bubble/games"]);
    const before = t.fake.sent.length;
    expect(t.link.react("#bubble/games", { to: MSGID, emoji: emoji, on: true })).toBe(false);
    expect(t.fake.sent.slice(before)).toEqual([]);
  });

  it.each([
    ["a space", "a b"],
    ["a CR LF and a second command", "a\r\nQUIT"],
    ["a semicolon and a second tag", "a;+typing=active"],
    ["a backslash", "a\\b"],
    ["a comma", "a,b"],
    ["a leading colon", ":a"],
    ["nothing", ""],
    ["65 characters", "a".repeat(65)],
  ])("sends no reaction to a msgid holding %s", (_, id) => {
    const t = memberIn(["#bubble/games"]);
    const before = t.fake.sent.length;
    expect(t.link.react("#bubble/games", { to: id, emoji: "👍", on: true })).toBe(false);
    expect(t.fake.sent.slice(before)).toEqual([]);
  });

  it("reacts nowhere as a guest, nor in a room Ergo has not said it is in, nor while away", () => {
    const g = guestIn(["#bubble/games"]);
    g.fake.line(`:${GUEST}!u@h JOIN #bubble/games`);
    expect(g.link.react("#bubble/games", { to: MSGID, emoji: "👍", on: true })).toBe(false);
    const t = memberIn(["#bubble/games", "#bubble"]);
    expect(t.link.react("#bubble", { to: MSGID, emoji: "👍", on: true })).toBe(false);
    t.fake.state("waiting");
    expect(t.link.react("#bubble/games", { to: MSGID, emoji: "👍", on: true })).toBe(false);
    expect(tagged([...g.fake.sent, ...t.fake.sent])).toEqual([]);
  });
});

// R10: Ergo refuses a reaction in a room the account may not speak in (+m, a mute), answering its label with a 404; the
// page shows no reaction Ergo did not echo, and says it could not react.
describe("the chat's link: a reaction Ergo refused", () => {
  const MSGID = "rmq4xvjw9ys5pwtqqjxbqwvhjc";
  const memberIn = (rooms: readonly string[]) => {
    const t = setup();
    t.link.follow(rooms);
    t.link.show(rooms[0]);
    t.signedIn(ADDRESS);
    const fake = t.connected(ADDRESS);
    fake.line(`:${ADDRESS}!u@h JOIN ${rooms[0] ?? ""}`);
    return { ...t, fake };
  };
  // The label of the last reaction sent, which Ergo answers by (the link's own word, F1170).
  const labelOf = (sent: readonly string[]) =>
    /^@label=([^;]+);/u.exec(sent.filter((line) => line.startsWith("@")).at(-1) ?? "")?.[1] ?? "";
  const refusal = (label: string) => `@label=${label} :ergo 404 ${ADDRESS} #bubble/games :Cannot send to channel (+m)`;

  it("tells the store Ergo refused the reaction its label names, in that reaction's room", () => {
    const t = memberIn(["#bubble/games", "#bubble"]);
    t.fake.line(`:${ADDRESS}!u@h JOIN #bubble`);
    t.link.react("#bubble", { to: MSGID, emoji: "😂", on: true });
    t.link.react("#bubble/games", { to: MSGID, emoji: "👍", on: true });
    t.fake.line(refusal(labelOf(t.fake.sent)));
    expect(t.room("#bubble/games")?.cannotReact).toBe(true);
    expect(t.room("#bubble")?.cannotReact).toBeUndefined();
  });

  it.each([
    ["a 404 with no label", `:ergo 404 ${ADDRESS} #bubble/games :Cannot send to channel (+m)`],
    ["a 404 with a label it never sent", refusal("r9")],
    [
      "its reaction's echo, which is no refusal",
      (label: string) =>
        `@label=${label};msgid=x;time=2026-10-25T10:00:00.000Z;account=${ADDRESS};+draft/react=👍;+reply=${MSGID} :${ADDRESS}!u@h TAGMSG #bubble/games`,
    ],
  ])("tells the store nothing of %s", (_, line) => {
    const t = memberIn(["#bubble/games"]);
    t.link.react("#bubble/games", { to: MSGID, emoji: "👍", on: true });
    t.fake.line(typeof line === "string" ? line : line(labelOf(t.fake.sent)));
    expect(t.room("#bubble/games")?.cannotReact).toBeUndefined();
  });
});

// R1: Ergo counts a stored reaction as a history item, so a page of 200 may hold few lines or none; while a full page
// leaves the room's window short of lines, the link asks for the items before its oldest, three times at most a room and
// a connection (docs/decisions.md, 2026-10-26).
describe("the chat's link: the history read past reactions", () => {
  const ROOM = "#bubble/games";
  const T = (n: number) => new Date(Date.parse(T0) + n * 1000).toISOString();
  // A member's link in ROOM, its history asked.
  const asked = () => {
    const t = setup();
    t.link.follow([ROOM]);
    t.link.show(ROOM);
    t.signedIn(ADDRESS);
    const fake = t.connected(ADDRESS);
    fake.line(`:${ADDRESS}!u@h JOIN ${ROOM}`);
    return { ...t, fake };
  };
  // A history page of `count` items from the `from`th second, `lines` of them lines, the rest reactions; `first`, the
  // oldest's msgid.
  const page = (fake: Fake, { count = HISTORY_LINES, lines = 0, from = 1000, first = `i${String(from)}` } = {}) => {
    const id = `h${String(from)}`;
    fake.line(`BATCH +${id} chathistory ${ROOM}`);
    for (let n = 0; n < count; n += 1) {
      const msgid = n === 0 ? first : `i${String(from + n)}`;
      const tags = `@batch=${id};msgid=${msgid};time=${T(from + n)};account=alice`;
      fake.line(
        n < lines
          ? `${tags} :alice!u@h PRIVMSG ${ROOM} :line ${String(n)}`
          : `${tags};+draft/react=👍;+reply=m1 :alice!u@h TAGMSG ${ROOM}`,
      );
    }
    fake.line(`BATCH -${id}`);
  };
  const before = (sent: readonly string[]) => sent.filter((line) => line.startsWith("CHATHISTORY BEFORE "));

  it("asks for the items before the oldest of a full page that holds no line", () => {
    const t = asked();
    page(t.fake, { first: "oldest" });
    expect(before(t.fake.sent)).toEqual([`CHATHISTORY BEFORE ${ROOM} msgid=oldest ${String(HISTORY_LINES)}`]);
  });

  it("asks again for a full page that leaves the window short of lines, its lines kept", () => {
    const t = asked();
    page(t.fake, { lines: 50, first: "oldest" });
    expect(t.room(ROOM)?.lines).toHaveLength(50);
    expect(before(t.fake.sent)).toEqual([`CHATHISTORY BEFORE ${ROOM} msgid=oldest ${String(HISTORY_LINES)}`]);
  });

  // The code review (CR1): JOIN and QUIT events fill pages too; the link reads on while Ergo's ring holds pages.
  it("asks from each full page's oldest while Ergo's ring of the room holds pages, ten more at most, then stops", () => {
    const t = asked();
    const pages = Array.from({ length: 12 }, (_, n) => 12_000 - n * 1000);
    for (const from of pages) page(t.fake, { from });
    expect(before(t.fake.sent)).toEqual(
      pages.slice(0, 10).map((from) => `CHATHISTORY BEFORE ${ROOM} msgid=i${String(from)} ${String(HISTORY_LINES)}`),
    );
  });

  // Ergo's ring, as the deploy's template sets it (deploy/ergo/ircd.yaml.tmpl): the bound read from the same number.
  it("bounds its asks by the ring the deploy's Ergo keeps a room", () => {
    const template = readFileSync(new URL("../../../../deploy/ergo/ircd.yaml.tmpl", import.meta.url), "utf8");
    expect(/^ {2}channel-length: (\d+)$/m.exec(template)?.[1]).toBe(String(HISTORY_RING));
  });

  it("asks no more when a page came short, at the history's start, or the window holds its lines", () => {
    const short = asked();
    page(short.fake, { count: HISTORY_LINES - 1 });
    const full = asked();
    page(full.fake, { lines: HISTORY_LINES });
    expect(before([...short.fake.sent, ...full.fake.sent])).toEqual([]);
  });

  it("asks nothing before an oldest item whose msgid a command cannot carry", () => {
    const t = asked();
    page(t.fake, { first: String.raw`a\sb` });
    expect(before(t.fake.sent)).toEqual([]);
  });

  // The green pass (G2): the oldest item's msgid as its tag carries it, what a command splits on leading too.
  it.each([
    ["a leading space", String.raw`\sa`],
    ["a leading comma", ",a"],
    ["a comma", "a,b"],
    ["a leading colon", ":a"],
    ["a tab", "a\tb"],
    ["a leading CR", String.raw`\ra`],
    ["a leading LF", String.raw`\na`],
    ["65 characters", "a".repeat(65)],
  ])("asks nothing before an oldest item whose msgid holds %s", (_, first) => {
    const t = asked();
    page(t.fake, { first });
    expect(before(t.fake.sent)).toEqual([]);
  });

  it("asks before an oldest item whose msgid has 64 characters", () => {
    const t = asked();
    page(t.fake, { first: "a".repeat(64) });
    expect(before(t.fake.sent)).toEqual([
      `CHATHISTORY BEFORE ${ROOM} msgid=${"a".repeat(64)} ${String(HISTORY_LINES)}`,
    ]);
  });

  // The green pass (G11): a page of nothing asks nothing, and throws nothing.
  it("asks nothing for an empty page, and throws nothing", () => {
    const t = asked();
    expect(() => {
      page(t.fake, { count: 0 });
    }).not.toThrow();
    expect(before(t.fake.sent)).toEqual([]);
  });

  it("counts its asks again on a new connection", () => {
    const t = asked();
    for (const from of [4000, 3000, 2000]) page(t.fake, { from });
    // Ergo's client reconnects as itself: what it sent before stays in its list.
    const asks = before(t.fake.sent).length;
    t.fake.state("waiting");
    const again = t.connected(ADDRESS);
    again.line(`:${ADDRESS}!u@h JOIN ${ROOM}`);
    page(again, { from: 9000 });
    expect(before(again.sent).slice(asks)).toEqual([`CHATHISTORY BEFORE ${ROOM} msgid=i9000 ${String(HISTORY_LINES)}`]);
  });
});

// 4d: a reply is a PRIVMSG tagged +reply with the msgid it answers (ratified in 2026: docs/plans/chat-features.md, M2),
// the draft composed as the composer composes it; a msgid a tag cannot carry sends nothing, the draft included.
describe("the chat's link: replies", () => {
  const MSGID = "rmq4xvjw9ys5pwtqqjxbqwvhjc";
  const memberIn = (rooms: readonly string[]) => {
    const t = setup();
    t.link.follow(rooms);
    t.link.show(rooms[0]);
    t.signedIn(ADDRESS);
    const fake = t.connected(ADDRESS);
    fake.line(`:${ADDRESS}!u@h JOIN ${rooms[0] ?? ""}`);
    return { ...t, fake };
  };

  it("sends a reply as the composer composes the draft, tagged with the msgid it answers", () => {
    const t = memberIn(["#bubble/games"]);
    expect(t.link.say("#bubble/games", "  hi **all**  ", MSGID)).toBe(true);
    expect(t.link.say("#bubble/games", "/me waves", MSGID)).toBe(true);
    expect(t.fake.sent.filter((line) => line.startsWith("@"))).toEqual([
      `@+reply=${MSGID} PRIVMSG #bubble/games :hi **all**`,
      `@+reply=${MSGID} PRIVMSG #bubble/games :\u0001ACTION waves\u0001`,
    ]);
  });

  it.each([
    ["a space", "a b"],
    ["a CR LF and a second command", "a\r\nQUIT"],
    ["a semicolon and a second tag", "a;+typing=active"],
    ["a backslash", "a\\b"],
    ["nothing", ""],
    ["65 characters", "a".repeat(65)],
    // The green pass (G2): what a tag escapes, leading too.
    ["a leading semicolon", ";a"],
    ["a leading backslash", "\\a"],
    ["a leading space", " a"],
    ["a leading comma", ",a"],
    ["a comma", "a,b"],
    ["a leading colon", ":a"],
    ["a tab", "a\tb"],
    ["a leading CR", "\ra"],
    ["a leading LF", "\na"],
    ["a NUL", "a\u0000b"],
    ["a leading NUL", "\u0000a"],
  ])("sends no reply to a msgid holding %s, nor the draft without it", (_, id) => {
    const t = memberIn(["#bubble/games"]);
    const before = t.fake.sent.length;
    expect(t.link.say("#bubble/games", "hi", id)).toBe(false);
    expect(t.fake.sent.slice(before)).toEqual([]);
  });

  it("sends a reply to a msgid of 64 characters", () => {
    const t = memberIn(["#bubble/games"]);
    expect(t.link.say("#bubble/games", "hi", "a".repeat(64))).toBe(true);
    expect(t.fake.sent.filter((line) => line.startsWith("@"))).toEqual([
      `@+reply=${"a".repeat(64)} PRIVMSG #bubble/games :hi`,
    ]);
  });

  it("sends no reply as a guest, nor in a room Ergo has not said it is in", () => {
    const g = guestIn(["#bubble/games"]);
    g.fake.line(`:${GUEST}!u@h JOIN #bubble/games`);
    const t = memberIn(["#bubble/games", "#bubble"]);
    expect(g.link.say("#bubble/games", "hi", MSGID)).toBe(false);
    expect(t.link.say("#bubble", "hi", MSGID)).toBe(false);
    expect([...g.fake.sent, ...t.fake.sent].filter((line) => line.includes("PRIVMSG"))).toEqual([]);
  });
});

// 4f-n (docs/decisions.md, 2026-10-26): what the link makes a notice of, from Ergo's lines (the kinds themselves are
// core/chat/notice.test.ts's).
describe("the chat's link: notices", () => {
  const GAMES = "#bubble/games";
  const NEWS = "#bubble/news";
  const T = (minute: number) => `2026-10-25T10:${String(minute).padStart(2, "0")}:00.000Z`;
  // An account in three rooms of a world, #games in view, #news a room where a mention of the whole room counts.
  const member = (device?: LinkDeps["device"]) => {
    const t = setup(undefined, device);
    t.link.follow([GAMES, "#bubble", NEWS], [NEWS]);
    t.link.show(GAMES);
    t.signedIn(ADDRESS);
    const fake = t.connected(ADDRESS);
    for (const room of [GAMES, "#bubble", NEWS]) fake.line(`:${ADDRESS}!u@h JOIN ${room}`);
    return { ...t, fake, notices: () => t.store.getState().notices };
  };
  // A line of OTHER's, by default, in a room at T(minute), its msgid `id`.
  const said = (
    fake: Fake,
    [room, id, text]: readonly [room: string, id: string, text: string],
    { minute = 5, from = OTHER, command = "PRIVMSG" } = {},
  ) => {
    fake.line(`@msgid=${id};time=${T(minute)};account=${from} :${from}!u@h ${command} ${room} :${text}`);
  };
  const kinds = (t: { notices: () => readonly { id: string; kind: string; where: string }[] }) =>
    t.notices().map(({ id, kind, where }) => [id, kind, where]);

  it("makes a notice of a line that names the account, in a room followed though not in view", () => {
    const t = member();
    said(t.fake, ["#bubble", "m1", `look @${ADDRESS}`]);
    expect(t.notices()).toEqual([{ id: "m1", kind: "mention", where: "#bubble", time: T(5), by: OTHER }]);
  });

  it("makes none of a plain line, a mention of someone else, the account's own line as Ergo echoes it, or a NOTICE", () => {
    const t = member();
    said(t.fake, [GAMES, "m1", "hello"]);
    said(t.fake, [GAMES, "m2", `hello @${OTHER}`]);
    said(t.fake, [GAMES, "m3", `note to @${ADDRESS}`], { from: ADDRESS });
    said(t.fake, [GAMES, "m4", `@${ADDRESS} a verdict`], { command: "NOTICE" });
    expect(t.notices()).toEqual([]);
  });

  it("makes one notice of a line Ergo sends twice", () => {
    const t = member();
    said(t.fake, ["#bubble", "m1", `@${ADDRESS}`]);
    said(t.fake, ["#bubble", "m1", `@${ADDRESS}`]);
    expect(t.notices()).toHaveLength(1);
  });

  it("makes a notice of a mention of the whole room in the rooms the page named, and in no other", () => {
    const t = member();
    said(t.fake, [NEWS, "n1", "@room the release is out"]);
    said(t.fake, ["#bubble", "m1", "@room the release is out"]);
    said(t.fake, [GAMES, "g1", "@room the release is out"]);
    expect(kinds(t)).toEqual([["n1", "group", NEWS]]);
  });

  it("forgets the rooms where a mention of the whole room counts when the page lists others", () => {
    const t = member();
    t.link.follow([GAMES, "#bubble", NEWS], []);
    said(t.fake, [NEWS, "n1", "@room the release is out"]);
    expect(t.notices()).toEqual([]);
  });

  it("makes no notice in a room the reader set to none, and one again once it is not", () => {
    const t = member();
    t.store.getState().noticeActions.setMode("#bubble", "none");
    said(t.fake, ["#bubble", "m1", `@${ADDRESS}`]);
    expect(t.notices()).toEqual([]);
    t.store.getState().noticeActions.setMode("#bubble", "all");
    said(t.fake, ["#bubble", "m2", `@${ADDRESS}`]);
    expect(kinds(t)).toEqual([["m2", "mention", "#bubble"]]);
  });

  it("reads the modes of the account's device when its session starts", () => {
    const t = member(() => ({
      prefs: { onlyKnown: () => false, setOnlyKnown: () => true, known: () => [], setKnown: () => true },
      drafts: { get: () => "", set: () => true },
      notices: { modes: () => ({ "#bubble": "none" }), setModes: () => true },
    }));
    said(t.fake, ["#bubble", "m1", `@${ADDRESS}`]);
    said(t.fake, [GAMES, "g1", `@${ADDRESS}`]);
    expect(kinds(t)).toEqual([["g1", "mention", GAMES]]);
  });

  describe("direct messages", () => {
    const dm = (fake: Fake, [id, from, to]: readonly [string, string, string], text = "hi") => {
      fake.line(`@msgid=${id};time=${T(5)};account=${from} :${from}!u@h PRIVMSG ${to} :${text}`);
    };

    it("makes a notice of an account's message to the reader, under its partner, and none of the reader's own", () => {
      const t = member();
      dm(t.fake, ["d1", OTHER, ADDRESS]);
      dm(t.fake, ["d2", ADDRESS, OTHER], "hello");
      expect(t.notices()).toEqual([{ id: "d1", kind: "dm", where: OTHER, time: T(5), by: OTHER }]);
    });

    it("makes none of a message the store discards while the account hears those it wrote to alone", () => {
      const t = member(() => ({
        prefs: { onlyKnown: () => true, setOnlyKnown: () => true, known: () => [], setKnown: () => true },
        drafts: { get: () => "", set: () => true },
      }));
      dm(t.fake, ["d1", OTHER, ADDRESS]);
      expect(t.store.getState().dms).toEqual({});
      expect(t.notices()).toEqual([]);
    });

    it("makes none of a direct message to a guest, nor of a room's line naming an address, for a guest", () => {
      const t = guestIn(["#bubble"]);
      t.fake.line(`@msgid=d1;time=${T(5)};account=${OTHER} :${OTHER}!u@h PRIVMSG ${GUEST} :hi`);
      t.fake.line(`@msgid=m1;time=${T(5)};account=${OTHER} :${OTHER}!u@h PRIVMSG #bubble :@${ADDRESS}`);
      expect(t.store.getState().notices).toEqual([]);
    });
  });

  // A hidden or a deleted line must not stay a notice that opens on nothing; the bot hides after posting (3j).
  it("drops the notice of a line Ergo's REDACT takes away, the bot's hide included", () => {
    const t = member();
    said(t.fake, ["#bubble", "m1", `@${ADDRESS}`]);
    said(t.fake, ["#bubble", "m2", `@${ADDRESS}`]);
    t.fake.line(`:gnoworld!u@h REDACT #bubble m1`);
    expect(kinds(t)).toEqual([["m2", "mention", "#bubble"]]);
  });

  // The room in view's history page: what came while the page was away, past the reading place Ergo keeps.
  describe("the history page", () => {
    const page = (fake: Fake, lines: readonly [id: string, minute: number, text: string][], room = GAMES) => {
      fake.line(`BATCH +h1 chathistory ${room}`);
      for (const [id, minute, text] of lines)
        fake.line(`@batch=h1;msgid=${id};time=${T(minute)};account=${OTHER} :${OTHER}!u@h PRIVMSG ${room} :${text}`);
      fake.line("BATCH -h1");
    };

    it("makes a notice of each line past the reading place Ergo gave that names the account, and of no other", () => {
      const t = member();
      t.fake.line(`:ergo MARKREAD ${GAMES} timestamp=${T(2)}`);
      page(t.fake, [
        ["h1", 1, `@${ADDRESS}`],
        ["h2", 2, `@${ADDRESS}`],
        ["h3", 3, `@${ADDRESS}`],
        ["h4", 4, "plain"],
      ]);
      expect(kinds(t)).toEqual([["h3", "mention", GAMES]]);
    });

    // F1534: each notice of a page set the store on its own, a notification for each of up to 200 lines.
    it("hands the notices of a page to the store in one change", () => {
      const t = member();
      t.fake.line(`:ergo MARKREAD ${GAMES} timestamp=${T(0)}`);
      let changes = 0;
      let held = t.store.getState().notices;
      t.store.subscribe((state) => {
        if (state.notices !== held) changes += 1;
        held = state.notices;
      });
      page(t.fake, [
        ["h1", 1, `@${ADDRESS}`],
        ["h2", 2, `@${ADDRESS}`],
        ["h3", 3, `@${ADDRESS}`],
      ]);
      expect(t.notices()).toHaveLength(3);
      expect(changes).toBe(1);
    });

    it("makes none while Ergo gave no reading place, none being a place from which every line is unread", () => {
      const t = member();
      page(t.fake, [["h1", 1, `@${ADDRESS}`]]);
      expect(t.notices()).toEqual([]);
    });

    it("makes a notice once though the page comes again on a reconnect", () => {
      const t = member();
      t.fake.line(`:ergo MARKREAD ${GAMES} timestamp=${T(0)}`);
      page(t.fake, [["h1", 1, `@${ADDRESS}`]]);
      page(t.fake, [["h1", 1, `@${ADDRESS}`]]);
      expect(t.notices()).toHaveLength(1);
    });

    it("makes one notice of a line the history page repeats after a live message", () => {
      const t = member();
      t.fake.line(`:ergo MARKREAD ${GAMES} timestamp=${T(0)}`);
      said(t.fake, [GAMES, "h1", `@${ADDRESS}`], { minute: 1 });
      page(t.fake, [["h1", 1, `@${ADDRESS}`]]);
      expect(t.notices()).toHaveLength(1);
    });
  });

  describe("what the reader has seen", () => {
    it("sees the room up to the line read, as the page marks it read, at once and not as Ergo answers", () => {
      const t = member();
      said(t.fake, [GAMES, "m1", `@${ADDRESS}`], { minute: 3 });
      said(t.fake, [GAMES, "m2", "plain"], { minute: 4 });
      t.link.read(GAMES, "m1");
      expect(t.store.getState().noticeSeen[GAMES]).toBe(T(3));
      t.link.read(GAMES, "m2");
      expect(t.store.getState().noticeSeen[GAMES]).toBe(T(4));
    });

    it("sees nothing for a room that is not in view, nor for a line the store does not hold", () => {
      const t = member();
      said(t.fake, ["#bubble", "m1", `@${ADDRESS}`]);
      t.link.read("#bubble", "m1");
      t.link.read(GAMES, "nope");
      expect(t.store.getState().noticeSeen).toEqual({});
    });
  });
});

// 4f-n, the red pass's cases (docs/review/findings.md, R2 to R16): what must not leak between sessions, outlive a room, or
// slip through the history page's own path; a direct message's privacy and reading; replies and edits.
describe("the chat's link: notices, the edges", () => {
  const GAMES = "#bubble/games";
  const NEWS = "#bubble/news";
  const BOB = Address.parse("g1f6dcp6he2vq9gymrm4yrnyx66n0578vf7fsksl");
  const T = (minute: number) => `2026-10-25T10:${String(minute).padStart(2, "0")}:00.000Z`;
  const prefs = (known: string[] = [], onlyKnown = false) => ({
    prefs: { onlyKnown: () => onlyKnown, setOnlyKnown: () => true, known: () => known, setKnown: () => true },
    drafts: { get: () => "", set: () => true },
  });
  const member = (device?: LinkDeps["device"], account: string = ADDRESS) => {
    const t = setup(undefined, device);
    t.link.follow([GAMES, "#bubble", NEWS], [NEWS]);
    t.link.show(GAMES);
    t.signedIn(Address.parse(account));
    const fake = t.connected(account);
    for (const room of [GAMES, "#bubble", NEWS]) fake.line(`:${account}!u@h JOIN ${room}`);
    return { ...t, fake, notices: () => t.store.getState().notices };
  };
  const say = (
    fake: Fake,
    [room, id, text]: readonly [string, string, string],
    { minute = 5, from = OTHER, command = "PRIVMSG", tags = "" } = {},
  ) => {
    fake.line(`@msgid=${id};time=${T(minute)};account=${from}${tags} :${from}!u@h ${command} ${room} :${text}`);
  };
  const ids = (t: { notices: () => readonly { id: string }[] }) => t.notices().map(({ id }) => id);

  describe("a session", () => {
    it("forgets an account's notices, marks and modes as it signs out, and asks the device for each account alone", () => {
      const asked: string[] = [];
      const device = (account: string) => {
        asked.push(account);
        return { ...prefs(), notices: { modes: () => ({ [NEWS]: "none" as const }), setModes: () => true } };
      };
      const t = member(device);
      const old = t.fake;
      say(old, [GAMES, "m1", `@${ADDRESS}`], { minute: 3 });
      say(old, ["#bubble", "m2", `@${ADDRESS}`]);
      t.link.read(GAMES, "m1");
      t.store.getState().noticeActions.setMode("#bubble", "all");
      expect(t.store.getState().noticeSeen[GAMES]).toBe(T(3));
      t.signedOut();
      expect(t.store.getState().notices).toEqual([]);
      expect(t.store.getState().noticeSeen).toEqual({});
      expect(t.store.getState().noticeModes).toEqual({});
      expect(asked).toEqual([ADDRESS]);
      // A late line of the old connection reaches nothing.
      say(old, [GAMES, "m3", `@${ADDRESS}`]);
      expect(t.notices()).toEqual([]);
      t.signedIn(BOB);
      expect(asked).toEqual([ADDRESS, BOB]);
      expect(t.store.getState().notices).toEqual([]);
      expect(t.store.getState().noticeModes).toEqual({ [NEWS]: "none" });
    });

    // G1 (F1500): the account held no mode, so the guard in `begin` that skips a reset for an empty session saw its notices.
    it("forgets an account's notices and marks at sign-out though it held no mode, for the next account of the device", () => {
      const t = member(() => ({ ...prefs(), notices: { modes: () => ({}), setModes: () => true } }));
      say(t.fake, [GAMES, "m1", `@${ADDRESS}`], { minute: 3 });
      say(t.fake, ["#bubble", "m2", `@${ADDRESS}`]);
      t.link.read(GAMES, "m1");
      expect(t.store.getState().notices).toHaveLength(2);
      expect(t.store.getState().noticeSeen[GAMES]).toBe(T(3));
      t.signedOut();
      expect(t.store.getState().notices).toEqual([]);
      expect(t.store.getState().noticeSeen).toEqual({});
      t.signedIn(BOB);
      expect(t.store.getState().notices).toEqual([]);
      expect(t.store.getState().noticeSeen).toEqual({});
    });
  });

  // G2 (F1501): the connection of a guest has a nick, so `me` is defined; only the account check keeps it out.
  describe("a guest", () => {
    it("makes no notice of a live mention of the whole room, in a room where it counts", () => {
      const t = guestIn([NEWS]);
      t.link.follow([NEWS], [NEWS]);
      t.fake.line(`:${GUEST}!u@h JOIN ${NEWS}`);
      t.fake.line(`@msgid=g1;time=${T(5)};account=${OTHER} :${OTHER}!u@h PRIVMSG ${NEWS} :@room`);
      expect(t.store.getState().notices).toEqual([]);
      expect(totalOf(t)).toBe(0);
    });
  });

  // G3 (F1502): lines that are no text line, or come for a room not followed, pass the notices by.
  describe("a line of Ergo's that is no notice's", () => {
    const tag = `@batch=h1;msgid=t1;time=${T(4)};account=${OTHER};+draft/react=:+1:;+draft/reply=m0`;
    it("lets a reaction in a history page pass, and the mention after it still counts", () => {
      const t = member();
      t.fake.line(`:ergo MARKREAD ${GAMES} timestamp=${T(2)}`);
      t.fake.line(`BATCH +h1 chathistory ${GAMES}`);
      t.fake.line(`${tag} :${OTHER}!u@h TAGMSG ${GAMES}`);
      t.fake.line(`@batch=h1;msgid=h5;time=${T(5)};account=${OTHER} :${OTHER}!u@h PRIVMSG ${GAMES} :@${ADDRESS}`);
      t.fake.line("BATCH -h1");
      expect(ids(t)).toEqual(["h5"]);
    });

    it("lets a live reaction in a joined room pass, and a line of a room not followed", () => {
      const t = member();
      t.fake.line(`@msgid=t2;time=${T(4)};account=${OTHER};+draft/react=:+1: :${OTHER}!u@h TAGMSG ${GAMES}`);
      say(t.fake, ["#elsewhere", "x1", `@${ADDRESS}`]);
      expect(t.notices()).toEqual([]);
    });

    it("lets a history page of a room not followed pass", () => {
      const t = member();
      t.fake.line("BATCH +h2 chathistory #elsewhere");
      t.fake.line(`@batch=h2;msgid=x2;time=${T(5)};account=${OTHER} :${OTHER}!u@h PRIVMSG #elsewhere :@${ADDRESS}`);
      t.fake.line("BATCH -h2");
      expect(t.notices()).toEqual([]);
    });
  });

  describe("a room the account is taken out of", () => {
    it.each([
      ["a KICK of it", `:ergo!u@h KICK ${NEWS} ${ADDRESS} :bye`],
      ["its PART, from another session", `:${ADDRESS}!u@h PART ${NEWS}`],
    ])("loses that room's notices at %s, and makes no more of its lines", (_, taken) => {
      const t = member();
      say(t.fake, [NEWS, "n1", `@${ADDRESS}`]);
      say(t.fake, [GAMES, "g1", `@${ADDRESS}`]);
      t.fake.line(taken);
      expect(ids(t)).toEqual(["g1"]);
      say(t.fake, [NEWS, "n2", `@${ADDRESS}`]);
      expect(ids(t)).toEqual(["g1"]);
    });
  });

  describe("the history page, by the same rules as a live line", () => {
    const page = (fake: Fake, lines: readonly (readonly [string, number, string, object?])[], room = GAMES) => {
      fake.line(`BATCH +h1 chathistory ${room}`);
      for (const [id, minute, text, over = {}] of lines) {
        const { from = OTHER, command = "PRIVMSG" } = over as { from?: string; command?: string };
        fake.line(`@batch=h1;msgid=${id};time=${T(minute)};account=${from} :${from}!u@h ${command} ${room} :${text}`);
      }
      fake.line("BATCH -h1");
    };
    const mention = `@${ADDRESS}`;

    it.each([
      ["the account's own line, from another device", { from: ADDRESS }],
      ["a NOTICE", { command: "NOTICE", from: "gnoworld" }],
    ])("makes none of %s", (_, over) => {
      const t = member();
      t.fake.line(`:ergo MARKREAD ${GAMES} timestamp=${T(2)}`);
      page(t.fake, [["h3", 3, mention, over]]);
      expect(t.notices()).toEqual([]);
    });

    it("makes none in a room set to none, nor of a line at the reading place, and one of a line past it", () => {
      const t = member();
      t.fake.line(`:ergo MARKREAD ${GAMES} timestamp=${T(2)}`);
      t.store.getState().noticeActions.setMode(GAMES, "none");
      page(t.fake, [["h3", 3, mention]]);
      expect(t.notices()).toEqual([]);
      t.store.getState().noticeActions.setMode(GAMES, "mentions");
      page(t.fake, [
        ["h2", 2, mention],
        ["h4", 4, mention],
      ]);
      expect(ids(t)).toEqual(["h4"]);
    });

    it("makes a notice of a mention of the room in a room where it counts, and none for a guest", () => {
      const t = member();
      t.link.show(NEWS);
      t.fake.line(`:ergo MARKREAD ${NEWS} timestamp=${T(2)}`);
      page(t.fake, [["h3", 3, "@room"]], NEWS);
      expect(t.store.getState().notices.map(({ kind }) => kind)).toEqual(["group"]);
      const guest = guestIn([GAMES]);
      guest.link.follow([GAMES], [GAMES]);
      guest.fake.line(`:${GUEST}!u@h JOIN ${GAMES}`);
      guest.fake.line(`:ergo MARKREAD ${GAMES} timestamp=${T(2)}`);
      page(guest.fake, [["h3", 3, "@room"]]);
      expect(guest.store.getState().notices).toEqual([]);
    });
  });

  describe("direct messages", () => {
    const dm = (fake: Fake, [id, from, to]: readonly [string, string, string], over: { command?: string } = {}) => {
      const account = from === "gnoworld" ? "" : `;account=${from}`;
      fake.line(`@msgid=${id};time=${T(5)}${account} :${from}!u@h ${over.command ?? "PRIVMSG"} ${to} :hi`);
    };

    // R7: the rule is "never a message the account discards", not "never a message".
    it("makes a notice of a message from one the account wrote to, none of a stranger's, and one once it wrote to it", () => {
      const t = member(() => prefs([OTHER], true));
      dm(t.fake, ["d1", OTHER, ADDRESS]);
      dm(t.fake, ["d2", BOB, ADDRESS]);
      expect(ids(t)).toEqual(["d1"]);
      dm(t.fake, ["d3", ADDRESS, BOB]);
      dm(t.fake, ["d4", BOB, ADDRESS]);
      expect(ids(t)).toEqual(["d1", "d4"]);
    });

    it("makes none of an account's NOTICE to the nick, nor of the bot's, which carries no account", () => {
      const t = member();
      dm(t.fake, ["d1", OTHER, ADDRESS], { command: "NOTICE" });
      dm(t.fake, ["d2", "gnoworld", ADDRESS], { command: "NOTICE" });
      expect(t.notices()).toEqual([]);
    });

    it("sees a conversation as Ergo's reading place of its partner passes it, a read on another device", () => {
      const t = member();
      dm(t.fake, ["d1", OTHER, ADDRESS]);
      t.fake.line(`:ergo MARKREAD ${OTHER} timestamp=${T(4)}`);
      expect(t.store.getState().noticeSeen[OTHER]).toBe(T(4));
      expect(t.store.getState().noticeSeen).not.toHaveProperty(GAMES);
      t.fake.line(`:ergo MARKREAD ${OTHER} timestamp=${T(5)}`);
      expect(totalOf(t)).toBe(0);
    });

    it("keeps a mark for a partner that is no address, or the account itself, out of its marks", () => {
      const t = member();
      t.fake.line(`:ergo MARKREAD somebody timestamp=${T(4)}`);
      t.fake.line(`:ergo MARKREAD ${ADDRESS} timestamp=${T(4)}`);
      expect(t.store.getState().noticeSeen).toEqual({});
    });
  });

  describe("a connection that drops and comes back", () => {
    it("keeps what was unseen and seen, and makes no second notice of a page that comes again", () => {
      const t = member();
      say(t.fake, ["#bubble", "u1", `@${ADDRESS}`]);
      say(t.fake, [GAMES, "m1", `@${ADDRESS}`], { minute: 3 });
      t.link.read(GAMES, "m1");
      t.fake.state("waiting");
      t.fake.me = ADDRESS;
      t.fake.state("connected");
      t.fake.line(`:${ADDRESS}!u@h JOIN ${GAMES}`);
      // Ergo's place is the older one, its throttled MARKREAD not yet echoed (F940), and the page repeats the line.
      t.fake.line(`:ergo MARKREAD ${GAMES} timestamp=${T(2)}`);
      t.fake.line(`BATCH +h1 chathistory ${GAMES}`);
      t.fake.line(`@batch=h1;msgid=m1;time=${T(3)};account=${OTHER} :${OTHER}!u@h PRIVMSG ${GAMES} :@${ADDRESS}`);
      t.fake.line("BATCH -h1");
      expect(ids(t)).toEqual(["u1", "m1"]);
      expect(t.store.getState().noticeSeen[GAMES]).toBe(T(3));
      expect(unseen(t)).toEqual(["u1"]);
    });
  });

  describe("replies and edits", () => {
    const own = (t: ReturnType<typeof member>) => {
      say(t.fake, [GAMES, "q1", "my question"], { minute: 1, from: ADDRESS });
    };

    it("makes a reply notice of a line that answers one of the account's lines the room holds", () => {
      const t = member();
      own(t);
      say(t.fake, [GAMES, "r1", "an answer"], { tags: ";+reply=q1" });
      expect(t.store.getState().notices).toEqual([{ id: "r1", kind: "reply", where: GAMES, time: T(5), by: OTHER }]);
    });

    it("makes none of a reply to a line the room does not hold (past the window), or to another's line", () => {
      const t = member();
      own(t);
      say(t.fake, [GAMES, "o1", "their question"], { minute: 2, from: BOB });
      say(t.fake, [GAMES, "r1", "an answer"], { tags: ";+reply=gone" });
      say(t.fake, [GAMES, "r2", "an answer"], { tags: ";+reply=o1" });
      expect(t.notices()).toEqual([]);
    });

    it("makes a reply notice from a history page, past the reading place", () => {
      const t = member();
      t.fake.line(`:ergo MARKREAD ${GAMES} timestamp=${T(0)}`);
      t.fake.line(`BATCH +h1 chathistory ${GAMES}`);
      t.fake.line(`@batch=h1;msgid=q1;time=${T(1)};account=${ADDRESS} :${ADDRESS}!u@h PRIVMSG ${GAMES} :mine`);
      t.fake.line(`@batch=h1;msgid=r1;time=${T(2)};account=${OTHER};+reply=q1 :${OTHER}!u@h PRIVMSG ${GAMES} :yes`);
      t.fake.line("BATCH -h1");
      expect(t.store.getState().notices.map(({ id, kind }) => [id, kind])).toEqual([["r1", "reply"]]);
    });

    it("leaves one notice for a line and its edit, whoever the edit names", () => {
      const t = member();
      say(t.fake, [GAMES, "m1", `@${ADDRESS}`]);
      say(t.fake, [GAMES, "e1", `@${ADDRESS} corrected`], { minute: 6, tags: ";+gnoworld/edit=m1" });
      say(t.fake, [GAMES, "m2", "plain"], { minute: 7 });
      say(t.fake, [GAMES, "e2", `@${ADDRESS} now`], { minute: 8, tags: ";+gnoworld/edit=m2" });
      expect(ids(t)).toEqual(["m1"]);
    });
  });
});

// What the store holds unseen, by line id, and its total: read from the store the link wrote to.
const unseen = (t: { store: ReturnType<typeof createAppStore> }) =>
  unseenNotices(t.store.getState()).map(({ id }) => id);
const totalOf = (t: { store: ReturnType<typeof createAppStore> }) => totalUnseen(t.store.getState());
