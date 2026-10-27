import { afterEach, describe, expect, it, vi } from "vitest";
import { logger } from "../log.ts";
import { fakeErgo, PASSWORD, welcome, type Peer } from "../testing/fakeErgo.ts";
import { ircLink, type Fetched, type Link, type Said } from "./link.ts";

// Slice 4's 4d, pins: the link reads one line of a room by its id, as Ergo holds it (CHATHISTORY AROUND <room>
// msgid=<id> 1 answers that line alone, an empty batch when it holds none: tried on v2.19.1), so a pin is never the
// page's word; and it hears a REDACT, which takes the line from the room's pins.
const links: Link[] = [];
afterEach(async () => {
  vi.useRealTimers();
  await Promise.all(links.splice(0).map((link) => link.stop()));
});

const start = (port: number, more: Partial<Parameters<typeof ircLink>[0]> = {}) => {
  const said: Said[] = [];
  const redacted: [string, string][] = [];
  const link = ircLink({
    host: "127.0.0.1",
    port,
    password: PASSWORD,
    rooms: () => ["#bubble", "#bubble/games"],
    onMessage: (message) => said.push(message),
    onRedact: (room: string, msgid: string) => redacted.push([room, msgid]),
    log: logger("a-pepper-of-forty-characters-0123456789", () => true),
    retryMs: () => 10,
    ...more,
  });
  links.push(link);
  return { said, redacted, link };
};
// What a line fetched says, or the word Ergo gave in its place.
const textOf = (got: Fetched): string => (typeof got === "string" ? got : got.text);
const ALICE = "g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv";
const batch = (peer: Peer, room: string, lines: [id: string, text: string][]) => {
  peer.say(`:ergo.test BATCH +b1 chathistory ${room}`);
  for (const [id, text] of lines)
    peer.say(
      `@batch=b1;msgid=${id};time=2026-10-25T10:00:00.000Z;account=${ALICE} :${ALICE}!u@h PRIVMSG ${room} :${text}`,
    );
  peer.say(":ergo.test BATCH -b1");
};
// A link in its rooms, and what its peer was sent.
async function ready(more: Parameters<typeof start>[1] = {}) {
  const ergo = await fakeErgo();
  const t = start(ergo.port, more);
  const peer = await ergo.peer(0);
  await welcome(peer);
  peer.say("PING :sync");
  await peer.next(/^PONG sync$/);
  return { ...t, peer, ergo };
}

describe("the link reads a line by its id", () => {
  it("asks Ergo for that line alone and answers it as it said it", async () => {
    const { link, peer } = await ready();
    const answer = link.line("#bubble/games", "m1");
    expect(await peer.next(/^CHATHISTORY /)).toBe("CHATHISTORY AROUND #bubble/games msgid=m1 1");
    batch(peer, "#bubble/games", [["m1", "see you at nine"]]);
    expect(await answer).toEqual({
      room: "#bubble/games",
      account: ALICE,
      msgid: "m1",
      text: "see you at nine",
      time: "2026-10-25T10:00:00.000Z",
    });
  });

  // Ergo's own answer that it holds no such line is not the same as no answer: only the first drops a pin (4d's R5, R7).
  it("says the line is gone, at the batch's end, for a line Ergo does not hold", async () => {
    const { link, peer } = await ready({ lineMs: 60_000 });
    const answer = link.line("#bubble", "gone");
    await peer.next(/^CHATHISTORY /);
    batch(peer, "#bubble", []);
    expect(await answer).toBe("gone");
  });

  it("says the line is gone for another line than the one asked, though Ergo sent it", async () => {
    const { link, peer } = await ready({ lineMs: 60_000 });
    const answer = link.line("#bubble", "m1");
    await peer.next(/^CHATHISTORY /);
    batch(peer, "#bubble", [["m2", "another line"]]);
    expect(await answer).toBe("gone");
  });

  // The bot's own line (a notice of its own, a line it hid) is no line a pin can hold: Ergo's answer is its own line.
  it("says the line is gone for a line the bot itself said", async () => {
    const { link, peer } = await ready({ lineMs: 60_000 });
    const answer = link.line("#bubble", "m1");
    await peer.next(/^CHATHISTORY /);
    peer.say(":ergo.test BATCH +b1 chathistory #bubble");
    peer.say(`@batch=b1;msgid=m1;time=2026-10-25T10:00:00.000Z;account=gnoworld :gnoworld!u@h NOTICE #bubble :hello`);
    peer.say(":ergo.test BATCH -b1");
    expect(await answer).toBe("gone");
  });

  it("gives no answer once its wait is over, and holds no question after it", async () => {
    const { link, peer, said } = await ready({ lineMs: 30 });
    expect(await link.line("#bubble", "m1")).toBe("unanswered");
    await peer.next(/^CHATHISTORY /);
    // The late batch is still that question's: it is not heard as a page, and the next ask is a question of its own.
    batch(peer, "#bubble", [["m1", "late"]]);
    peer.say("PING :sync2");
    await peer.next(/^PONG sync2$/);
    expect(said).toEqual([]);
    const again = link.line("#bubble", "m1");
    await peer.next(/^CHATHISTORY /);
    expect(await again).toBe("unanswered");
    expect(peer.lines.filter((line) => line.startsWith("CHATHISTORY "))).toHaveLength(2);
  });

  // The wait's own number: 5 s, under the 10 s a page waits on the server (4d's R13).
  it("waits five seconds for Ergo by default, not a moment less", async () => {
    const { link, peer } = await ready({});
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const answer = link.line("#bubble", "m1");
    await peer.next(/^CHATHISTORY /);
    await vi.advanceTimersByTimeAsync(4999);
    expect(await Promise.race([answer, Promise.resolve("waiting")])).toBe("waiting");
    await vi.advanceTimersByTimeAsync(1);
    expect(await answer).toBe("unanswered");
  });

  // A question under way when the link ends is answered at once and holds neither timer nor place (4d's R14).
  it("answers nothing, at once, for a question pending as the link stops, and holds no timer", async () => {
    const { link, peer } = await ready({ lineMs: 60_000 });
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const answer = link.line("#bubble", "m1");
    await peer.next(/^CHATHISTORY /);
    expect(vi.getTimerCount()).toBe(1);
    await link.stop();
    expect(await answer).toBe("unanswered");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("answers nothing for a question pending as the socket closes, and answers the next on the new connection", async () => {
    const { link, peer, ergo } = await ready({ lineMs: 60_000 });
    const answer = link.line("#bubble", "m1");
    await peer.next(/^CHATHISTORY /);
    peer.socket.destroy();
    expect(await answer).toBe("unanswered");
    const next = await ergo.peer(1);
    await welcome(next);
    next.say("PING :sync7");
    await next.next(/^PONG sync7$/);
    const again = link.line("#bubble", "m1");
    await next.next(/^CHATHISTORY /);
    batch(next, "#bubble", [["m1", "after the drop"]]);
    expect(textOf(await again)).toBe("after the drop");
  });

  it("asks one question for a line asked twice at once, and answers both", async () => {
    const { link, peer } = await ready({ lineMs: 60_000 });
    const [one, two] = [link.line("#bubble", "m1"), link.line("#bubble", "m1")];
    await peer.next(/^CHATHISTORY /);
    batch(peer, "#bubble", [["m1", "once"]]);
    expect(textOf(await one)).toBe("once");
    expect(textOf(await two)).toBe("once");
    expect(peer.lines.filter((line) => line.startsWith("CHATHISTORY "))).toHaveLength(1);
  });

  // The line fetched is read for the pin alone: not counted as activity, not checked again, not a catch-up page.
  it("hands the line to nobody else: it is not a message heard, and its batch no page", async () => {
    const { link, peer, said } = await ready({ lineMs: 60_000 });
    const answer = link.line("#bubble", "m1");
    await peer.next(/^CHATHISTORY /);
    batch(peer, "#bubble", [["m1", "pin me"]]);
    await answer;
    peer.say("PING :sync3");
    await peer.next(/^PONG sync3$/);
    expect(said).toEqual([]);
  });

  it("asks nothing, and answers none, while it is not in its rooms", async () => {
    const ergo = await fakeErgo();
    const { link } = start(ergo.port);
    const peer = await ergo.peer(0);
    expect(await link.line("#bubble", "m1")).toBe("unanswered");
    expect(peer.lines.some((line) => line.startsWith("CHATHISTORY "))).toBe(false);
  });

  // A room or an id comes from a page: a word that would break the line, or start another, is never sent.
  it.each([
    ["an id with a space", "#bubble", "m1 2"],
    ["an id with a line break and a command", "#bubble", "m1\r\nQUIT :gone"],
    ["an id with a comma", "#bubble", "m1,m2"],
    ["an empty id", "#bubble", ""],
    ["an id past 128 characters", "#bubble", "m".repeat(129)],
    ["a room with a space", "#bub ble", "m1"],
    ["a room with a line break", "#bubble\r\nQUIT :gone", "m1"],
    ["a room the link is not in", "#elsewhere", "m1"],
  ])("sends nothing for %s", async (_, room, msgid) => {
    const { link, peer } = await ready();
    expect(await link.line(room, msgid)).toBe("unanswered");
    peer.say("PING :sync4");
    await peer.next(/^PONG sync4$/);
    expect(peer.lines.filter((line) => /^(CHATHISTORY|QUIT)/.test(line))).toEqual([]);
  });
});

// Ergo answers its commands in order and keeps a batch whole: a catch-up page and a question are told apart by their
// place among the requests, never by what is in them (a page may hold the line asked for, still to be checked).
describe("a question and the catch-up pages of one connection", () => {
  const PAGES = { lastChecked: () => "2026-10-25T10:00:00.000Z", rooms: () => ["#bubble"] };

  it("keeps each batch to what asked for it: a page's lines are heard, the question's is not", async () => {
    const { link, peer, said } = await ready(PAGES);
    expect(peer.lines.filter((line) => line.startsWith("CHATHISTORY AFTER "))).toHaveLength(1);
    const answer = link.line("#bubble", "m1");
    await peer.next(/^CHATHISTORY AROUND /);
    // The page, sent first, holds the very line asked for, which is still to be checked: heard as any page's line.
    batch(peer, "#bubble", [["m1", "in the page"]]);
    batch(peer, "#bubble", [["m1", "in the answer"]]);
    expect(textOf(await answer)).toBe("in the answer");
    peer.say("PING :sync8");
    await peer.next(/^PONG sync8$/);
    expect(said.map(({ text }) => text)).toEqual(["in the page"]);
  });

  it("answers a question ended by Ergo's refusal at once, and keeps the order for the next", async () => {
    const { link, peer } = await ready({ lineMs: 60_000 });
    const refused = link.line("#bubble", "m1");
    await peer.next(/^CHATHISTORY /);
    peer.say(":ergo.test FAIL CHATHISTORY INVALID_PARAMS AROUND :nope");
    expect(await refused).toBe("unanswered");
    const next = link.line("#bubble", "m2");
    await peer.next(/^CHATHISTORY AROUND #bubble msgid=m2/);
    batch(peer, "#bubble", [["m2", "second"]]);
    expect(textOf(await next)).toBe("second");
  });

  it("loses the order, and waits for nothing, when a batch is of another room than the next request's", async () => {
    const { link, peer, said } = await ready({ lineMs: 60_000 });
    const answer = link.line("#bubble", "m1");
    await peer.next(/^CHATHISTORY /);
    batch(peer, "#bubble/games", [["g1", "another room's page"]]);
    peer.say("PING :sync9");
    await peer.next(/^PONG sync9$/);
    expect(said.map(({ text }) => text)).toEqual(["another room's page"]);
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    await link.stop();
    expect(await answer).toBe("unanswered");
  });
});

describe("the link hears a line taken from a room", () => {
  it("asks Ergo's redaction capability with the rest, so a REDACT reaches it", async () => {
    const ergo = await fakeErgo();
    start(ergo.port);
    const peer = await ergo.peer(0);
    expect(await peer.next(/^CAP REQ /)).toMatch(/ draft\/message-redaction( |$)/);
  });

  it("hands on the room and the line's id of a REDACT in one of its rooms", async () => {
    const { peer, redacted } = await ready();
    peer.say(`:${ALICE}!u@h REDACT #bubble/games m1`);
    peer.say(`:${ALICE}!u@h REDACT #bubble m2 :spam`);
    peer.say("PING :sync5");
    await peer.next(/^PONG sync5$/);
    expect(redacted).toEqual([
      ["#bubble/games", "m1"],
      ["#bubble", "m2"],
    ]);
  });

  // The bot's own hide comes back to it as a REDACT from itself (Ergo tells each member, the sender too): the guard that
  // leaves the bot's own lines out of what it hears must not leave this one out (4d's R1).
  it("hands on a REDACT of its own, a hide, as it does another's", async () => {
    const { peer, redacted } = await ready();
    peer.say(":gnoworld!u@h REDACT #bubble m3 :hate");
    peer.say("PING :sync10");
    await peer.next(/^PONG sync10$/);
    expect(redacted).toEqual([["#bubble", "m3"]]);
  });

  it("ignores a REDACT of a room that is not its own, or with no id", async () => {
    const { peer, redacted } = await ready();
    peer.say(`:${ALICE}!u@h REDACT #elsewhere m1`);
    peer.say(`:${ALICE}!u@h REDACT #bubble`);
    peer.say("PING :sync6");
    await peer.next(/^PONG sync6$/);
    expect(redacted).toEqual([]);
  });
});
