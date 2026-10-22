import { once } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import { logger } from "../log.ts";
import fc from "fast-check";
import { freePort } from "../testing/ergo.ts";
import { fakeErgo, message, PASSWORD, welcome, type Peer } from "../testing/fakeErgo.ts";
import { ircLink, retryDelay, type Link, type Said } from "./link.ts";

const CAPS = "CAP REQ :message-tags account-tag batch draft/chathistory server-time";
// Stopped before the fake Ergo closes, so no link reconnects to a server that is gone.
const links: Link[] = [];
afterEach(async () => {
  await Promise.all(links.splice(0).map((link) => link.stop()));
});

const start = (port: number, more: Partial<Parameters<typeof ircLink>[0]> = {}) => {
  const said: Said[] = [];
  const lines: string[] = [];
  const link = ircLink({
    host: "127.0.0.1",
    port,
    password: PASSWORD,
    rooms: () => ["#bubble", "#earth"],
    onMessage: (message) => said.push(message),
    log: logger("a-pepper-of-forty-characters-0123456789", (line) => lines.push(line)),
    retryMs: () => 10,
    ...more,
  });
  links.push(link);
  return { said, lines, link };
};

describe("the IRC link", () => {
  it("asks its capabilities, registers, logs in as an operator, then joins its rooms", async () => {
    const ergo = await fakeErgo();
    start(ergo.port);
    const peer = await ergo.peer(0);
    expect(await peer.next(/^CAP /)).toBe(CAPS);
    expect(await peer.next(/^NICK /)).toBe("NICK gnoworld");
    expect(await peer.next(/^USER /)).toBe("USER gnoworld 0 * gno.world");
    peer.say(":ergo.test CAP * ACK :message-tags account-tag batch draft/chathistory server-time");
    expect(await peer.next(/^CAP END$/)).toBe("CAP END");
    peer.say(":ergo.test 001 gnoworld :Welcome");
    expect(await peer.next(/^OPER /)).toBe(`OPER admin ${PASSWORD}`);
    peer.say(":ergo.test 381 gnoworld :You are now an IRC operator");
    expect(await peer.next(/^JOIN /)).toBe("JOIN #bubble,#earth");
  });

  it("joins its rooms in lines of 510 bytes at most, every one of them", async () => {
    const ergo = await fakeErgo();
    const rooms = Array.from({ length: 101 }, (_, n) => `#a-world-of-gno-number-${String(n)}`);
    start(ergo.port, { rooms: () => rooms });
    const peer = await ergo.peer(0);
    await welcome(peer);
    peer.say("PING :sync");
    await peer.next(/^PONG sync$/);
    const joins = peer.lines.filter((line) => line.startsWith("JOIN "));
    expect(joins.length).toBeGreaterThan(1);
    for (const join of joins) expect(Buffer.byteLength(join)).toBeLessThanOrEqual(510);
    expect(joins.flatMap((join) => join.slice(5).split(","))).toEqual(rooms);
  });

  it("never sends a room name that would break its line: a space, a CR LF", async () => {
    const ergo = await fakeErgo();
    start(ergo.port, { rooms: () => ["#ok", "#bad room", "#cr\r\nQUIT :gone", "#also-ok"] });
    const peer = await ergo.peer(0);
    await welcome(peer);
    peer.say("PING :sync");
    await peer.next(/^PONG sync$/);
    expect(peer.lines.filter((line) => /^(JOIN|QUIT)/.test(line))).toEqual(["JOIN #ok,#also-ok"]);
  });

  it("answers a PING with its PONG", async () => {
    const ergo = await fakeErgo();
    start(ergo.port);
    const peer = await ergo.peer(0);
    await welcome(peer);
    peer.say("PING :ergo.test");
    expect(await peer.next(/^PONG /)).toBe("PONG ergo.test");
  });

  it("hands on a message of its rooms with the account and id Ergo set, and nothing else", async () => {
    const ergo = await fakeErgo();
    const { said } = start(ergo.port);
    const peer = await ergo.peer(0);
    await welcome(peer);
    const tags = "account=g1alice;msgid=m1";
    peer.say(message(tags, "alice!u@h", ["#bubble", "hello world"]));
    peer.say(message("account=g1alice;msgid=m2", "alice!u@h", ["gnoworld", "a direct message"]));
    peer.say(message("msgid=m3", "guest!u@h", ["#bubble", "no account"]));
    peer.say(message("account=g1alice", "alice!u@h", ["#bubble", "no id"]));
    peer.say(message("account=g1bot;msgid=m4", "gnoworld!u@h", ["#bubble", "its own"]));
    peer.say(message("account=g1alice;msgid=m5", "alice!u@h", ["#elsewhere", "not its room"]));
    peer.say("@account=g1alice;msgid=m6 :alice!u@h NOTICE #bubble :a notice");
    peer.say(message("account=g1bob;msgid=m7", "bob!u@h", ["#earth", "last"]));
    await expect.poll(() => said.length).toBe(2);
    expect(said).toEqual([
      { room: "#bubble", account: "g1alice", msgid: "m1", text: "hello world" },
      { room: "#earth", account: "g1bob", msgid: "m7", text: "last" },
    ]);
  });

  it("reads past hostile lines and stays up: a NUL, a line over its limit, no command, garbage", async () => {
    const ergo = await fakeErgo();
    const { said } = start(ergo.port);
    const peer = await ergo.peer(0);
    await welcome(peer);
    peer.say(message("account=g1a;msgid=m1", "a!u@h", ["#bubble", "a\0b"]));
    peer.say(message("account=g1a;msgid=m2", "a!u@h", ["#bubble", "x".repeat(600)]));
    peer.say("@account=g1a;msgid=m3 :a!u@h");
    peer.say("\u{1F600}\uD800 garbage");
    peer.say(message("account=g1b;msgid=m4", "b!u@h", ["#bubble", "after"]));
    await expect.poll(() => said.map(({ msgid }) => msgid)).toEqual(["m4"]);
    expect(ergo.peers).toHaveLength(1);
  });

  it("drops a connection whose line never ends, and connects again", async () => {
    const ergo = await fakeErgo();
    start(ergo.port);
    const first = await ergo.peer(0);
    await welcome(first);
    first.socket.write("x".repeat(9 * 1024));
    await welcome(await ergo.peer(1));
    expect(ergo.peers).toHaveLength(2);
  });

  it("connects again when Ergo closes it, and joins its rooms again", async () => {
    const ergo = await fakeErgo();
    const { lines } = start(ergo.port);
    const first = await ergo.peer(0);
    await welcome(first);
    first.socket.destroy();
    await welcome(await ergo.peer(1));
    expect(lines.some((line) => line.includes('"event":"irc_closed"'))).toBe(true);
  });

  it("connects again when Ergo falls silent through three pings", async () => {
    const ergo = await fakeErgo();
    start(ergo.port, { pingMs: 20 });
    const first = await ergo.peer(0);
    await welcome(first);
    expect(await first.next(/^PING /)).toBe("PING gnoworld");
    await welcome(await ergo.peer(1));
    expect(ergo.peers).toHaveLength(2);
  });

  it("stops: closes its connection and never connects again", async () => {
    const ergo = await fakeErgo();
    start(ergo.port);
    const first = await ergo.peer(0);
    await welcome(first);
    const closed = once(first.socket, "close");
    await links.splice(0)[0]?.stop();
    await closed;
    // Ten times the retry delay: a link that came back would have by now.
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(ergo.peers).toHaveLength(1);
  });
});

// The bot's lines since a mark: only commands of its own list, none built from what it read.
const since = (peer: Peer, mark: number) => peer.lines.slice(mark);
// After its welcome the link answers with PONG alone; its own PINGs come from the watchdog's clock.
const OWN = /^(PONG|PING gnoworld$)( |$)/;
const sync = async (peer: Peer, token = "sync"): Promise<void> => {
  peer.say(`PING :${token}`);
  await peer.next(new RegExp(`^PONG ${token}$`));
};

describe("the IRC link, line by line", () => {
  it("reads a line however TCP cuts it: inside a CR LF, inside an emoji, two in one chunk", async () => {
    const ergo = await fakeErgo();
    const { said } = start(ergo.port);
    const peer = await ergo.peer(0);
    await welcome(peer);
    const bytes = Buffer.from(`${message("account=g1a;msgid=m1", "a!u@h", ["#bubble", "a 🪐 b"])}\r\n`);
    const cut = bytes.indexOf(Buffer.from("🪐")) + 2;
    peer.socket.write(bytes.subarray(0, cut));
    peer.socket.write(bytes.subarray(cut, -1));
    peer.socket.write(
      Buffer.concat([
        bytes.subarray(-1),
        Buffer.from(`${message("account=g1b;msgid=m2", "b!u@h", ["#earth", "two"])}\r\n`),
      ]),
    );
    await expect
      .poll(() => said.map(({ msgid, text }) => [msgid, text]))
      .toEqual([
        ["m1", "a 🪐 b"],
        ["m2", "two"],
      ]);
  });

  it("takes the longest line a server may send, and drops a connection on a longer one", async () => {
    const ergo = await fakeErgo();
    const { said } = start(ergo.port);
    const peer = await ergo.peer(0);
    await welcome(peer);
    const tags = `account=g1a;msgid=m1;pad=${"x".repeat(8191 - "@account=g1a;msgid=m1;pad= ".length)}`;
    const head = ":a!u@h PRIVMSG #bubble :";
    const longest = `@${tags} ${head}${"y".repeat(510 - head.length)}`;
    expect(Buffer.byteLength(longest)).toBe(8191 + 510);
    peer.say(longest);
    await expect.poll(() => said.map(({ msgid }) => msgid)).toEqual(["m1"]);
    peer.say(`${longest}z`);
    await welcome(await ergo.peer(1));
  });

  it("answers what it reads with its own commands alone: hostile lines and PINGs of every shape", async () => {
    const ergo = await fakeErgo();
    const { said } = start(ergo.port);
    const peer = await ergo.peer(0);
    await welcome(peer);
    const mark = peer.lines.length;
    peer.say(message("account=g1a;msgid=m1", "a!u@h", ["#bubble", "a\0b\r\nQUIT :gone"]));
    peer.say("PING");
    peer.say("PING :a b");
    peer.say("PING :a\0b");
    await sync(peer);
    expect(since(peer, mark)).toEqual(["PONG", "PONG :a b", "PONG sync"]);
    // Lines of any bytes, and PINGs of any token: the PONG must carry the token back, nothing more.
    const pings = fc.string({ maxLength: 40 }).map((token) => `PING :${token}`);
    await fc.assert(
      fc.asyncProperty(fc.oneof(fc.string({ unit: "binary", maxLength: 80 }), pings), async (line) => {
        peer.say(line);
        await sync(peer, "p");
      }),
      { numRuns: 200 },
    );
    expect(since(peer, mark).filter((sent) => !OWN.test(sent))).toEqual([]);
    for (const { room, account, msgid, text } of said) {
      expect([room === "#bubble" || room === "#earth", account !== "", msgid !== ""]).toEqual([true, true, true]);
      expect(text).not.toMatch(/[\0\r\n]/);
    }
  });

  it("hands on nothing but a room's text: no empty tags, no client tag, no STATUSMSG, TAGMSG or empty text", async () => {
    const ergo = await fakeErgo();
    const { said } = start(ergo.port);
    const peer = await ergo.peer(0);
    await welcome(peer);
    peer.say(message("account=;msgid=m1", "a!u@h", ["#bubble", "empty account"]));
    peer.say(message("account=g1a;msgid=", "a!u@h", ["#bubble", "empty id"]));
    peer.say(message("+account=g1a;msgid=m3", "a!u@h", ["#bubble", "a client's tag"]));
    peer.say(message("account=g1a;msgid=m4", "a!u@h", ["@#bubble", "to its operators"]));
    peer.say(message("account=g1a;msgid=m5", "a!u@h", ["+#bubble", "to its voices"]));
    peer.say("@account=g1a;msgid=m6 :a!u@h TAGMSG #bubble");
    peer.say("@account=g1a;msgid=m7 :a!u@h PRIVMSG #bubble");
    peer.say("@account=g1a;msgid=m8 :a!u@h PRIVMSG");
    peer.say(message("account=g1a;msgid=m9", "a!u@h", ["#bubble", ""]));
    peer.say(message("account=g1a;msgid=m10", "a!u@h", ["#bubble", "kept"]));
    await expect.poll(() => said.map(({ msgid }) => msgid)).toEqual(["m10"]);
  });
});

describe("the IRC link, when Ergo refuses it", () => {
  it("joins no room before Ergo says it is an operator", async () => {
    const ergo = await fakeErgo();
    start(ergo.port);
    const peer = await ergo.peer(0);
    await peer.next(/^CAP REQ /);
    peer.say(":ergo.test CAP * ACK :message-tags account-tag");
    peer.say(":ergo.test 001 gnoworld :Welcome");
    await peer.next(/^OPER /);
    await sync(peer);
    expect(peer.lines.filter((line) => line.startsWith("JOIN"))).toEqual([]);
  });

  it.each([
    ["a refused capability", ":ergo.test CAP * NAK :message-tags account-tag", "cap"],
    ["its nick held by a ghost", ":ergo.test 433 * gnoworld :Nickname is already in use", "nick"],
  ])("connects again later on %s, logging why", async (_, refusal, why) => {
    const ergo = await fakeErgo();
    const { lines } = start(ergo.port);
    const peer = await ergo.peer(0);
    await peer.next(/^USER /);
    peer.say(refusal);
    await ergo.peer(1);
    expect(lines.some((line) => line.includes('"event":"irc_refused"') && line.includes(`"error":"${why}"`))).toBe(
      true,
    );
  });

  it("on a refused operator password joins nothing, logs it without the password, and tries again later and later", async () => {
    const ergo = await fakeErgo();
    const attempts: number[] = [];
    const { lines } = start(ergo.port, {
      retryMs: (attempt) => {
        attempts.push(attempt);
        return 10;
      },
    });
    for (const nth of [0, 1, 2]) {
      const peer = await ergo.peer(nth);
      await peer.next(/^CAP REQ /);
      peer.say(":ergo.test CAP * ACK :message-tags account-tag");
      peer.say(":ergo.test 001 gnoworld :Welcome");
      await peer.next(/^OPER /);
      peer.say(":ergo.test 464 gnoworld :Password incorrect");
    }
    await ergo.peer(3);
    expect(attempts).toEqual([0, 1, 2]);
    expect(ergo.peers.flatMap((peer) => peer.lines).filter((line) => line.startsWith("JOIN"))).toEqual([]);
    expect(lines.filter((line) => line.includes('"error":"oper"'))).toHaveLength(3);
    expect(lines.join("")).not.toContain(PASSWORD);
  });

  it("waits for an Ergo that is not up yet, longer each time, and starts again from a second after a minute in", async () => {
    const port = await freePort();
    const attempts: number[] = [];
    const clock = vi.spyOn(Date, "now");
    try {
      start(port, {
        retryMs: (attempt) => {
          attempts.push(attempt);
          return 10;
        },
      });
      await expect.poll(() => attempts.length).toBeGreaterThanOrEqual(3);
      expect(attempts.slice(0, 3)).toEqual([0, 1, 2]);
      const ergo = await fakeErgo(port);
      const peer = await ergo.peer(0);
      await welcome(peer);
      clock.mockReturnValue(Date.now() + 60_000);
      const before = attempts.length;
      peer.socket.destroy();
      await ergo.peer(1);
      expect(attempts[before]).toBe(0);
    } finally {
      clock.mockRestore();
    }
  });

  it("keeps backing off when Ergo drops it right after taking it in", async () => {
    const ergo = await fakeErgo();
    const attempts: number[] = [];
    start(ergo.port, {
      retryMs: (attempt) => {
        attempts.push(attempt);
        return 10;
      },
    });
    for (const nth of [0, 1, 2]) {
      const peer = await ergo.peer(nth);
      await welcome(peer);
      peer.socket.destroy();
    }
    await ergo.peer(3);
    expect(attempts).toEqual([0, 1, 2]);
  });

  it("connects again when Ergo says ERROR and closes", async () => {
    const ergo = await fakeErgo();
    start(ergo.port);
    const peer = await ergo.peer(0);
    await welcome(peer);
    peer.say("ERROR :Closing Link: gnoworld (Excess Flood)");
    peer.socket.end();
    await welcome(await ergo.peer(1));
    expect(ergo.peers).toHaveLength(2);
  });
});

describe("the IRC link's watchdog", () => {
  it("pings three times into silence, then connects again", async () => {
    const ergo = await fakeErgo();
    start(ergo.port, { pingMs: 20 });
    const first = await ergo.peer(0);
    await welcome(first);
    await ergo.peer(1);
    expect(first.lines.filter((line) => line.startsWith("PING "))).toHaveLength(3);
  });

  it("keeps a connection whose pings are answered", async () => {
    const ergo = await fakeErgo();
    start(ergo.port, { pingMs: 20 });
    const peer = await ergo.peer(0);
    await welcome(peer);
    for (let n = 0; n < 10; n += 1) {
      const ping = await peer.next(/^PING /);
      peer.say(`:ergo.test PONG ergo.test :${ping.slice(5)}`);
    }
    expect(ergo.peers).toHaveLength(1);
  });

  it("drops a connection silent before its welcome too", async () => {
    const ergo = await fakeErgo();
    start(ergo.port, { pingMs: 20 });
    const first = await ergo.peer(0);
    await ergo.peer(1);
    expect(first.lines.filter((line) => line.startsWith("PING "))).toHaveLength(3);
  });
});

describe("the IRC link's stop", () => {
  it("cancels a reconnect it was waiting for, and a second stop does nothing", async () => {
    const ergo = await fakeErgo();
    const { lines } = start(ergo.port, { retryMs: () => 100 });
    const peer = await ergo.peer(0);
    await welcome(peer);
    peer.socket.destroy();
    // The link saw its close, so its retry is set; the stop must clear it.
    await expect.poll(() => lines.some((line) => line.includes('"event":"irc_closed"'))).toBe(true);
    const link = links.splice(0)[0];
    await link?.stop();
    await link?.stop();
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(ergo.peers).toHaveLength(1);
  });
});

describe("the IRC link, its green pass (3h)", () => {
  it("on 491, Ergo's answer to a wrong operator password (3b), joins nothing and logs it", async () => {
    const ergo = await fakeErgo();
    const { lines } = start(ergo.port);
    const peer = await ergo.peer(0);
    await peer.next(/^CAP REQ /);
    peer.say(":ergo.test CAP * ACK :message-tags account-tag");
    peer.say(":ergo.test 001 gnoworld :Welcome");
    await peer.next(/^OPER /);
    peer.say(":ergo.test 491 gnoworld :OPER failed");
    await ergo.peer(1);
    expect(peer.lines.filter((line) => line.startsWith("JOIN"))).toEqual([]);
    expect(
      lines.filter((line) => line.includes('"event":"irc_refused"') && line.includes('"error":"oper"')),
    ).toHaveLength(1);
  });

  it("reads past a PRIVMSG with no source, handing it on as any room's line", async () => {
    const ergo = await fakeErgo();
    const { said } = start(ergo.port);
    const peer = await ergo.peer(0);
    await welcome(peer);
    peer.say("@account=g1a;msgid=m1 PRIVMSG #bubble :no source");
    peer.say(message("account=g1a;msgid=m2", "a!u@h", ["#bubble", "after"]));
    await expect.poll(() => said.map(({ msgid }) => msgid)).toEqual(["m1", "m2"]);
    expect(ergo.peers).toHaveLength(1);
  });

  it("waits half a second to a second and a half before its first reconnect, by default", async () => {
    const ergo = await fakeErgo();
    const delays: number[] = [];
    const real = globalThis.setTimeout;
    const spy = vi.spyOn(globalThis, "setTimeout").mockImplementation((handler: () => void, ms?: number) => {
      delays.push(ms ?? 0);
      return real(handler, 10);
    });
    try {
      const link = ircLink({
        host: "127.0.0.1",
        port: ergo.port,
        password: PASSWORD,
        rooms: () => ["#bubble"],
        onMessage: () => undefined,
        log: logger("a-pepper-of-forty-characters-0123456789", () => true),
      });
      links.push(link);
      const peer = await ergo.peer(0);
      await welcome(peer);
      delays.splice(0);
      peer.socket.destroy();
      await ergo.peer(1);
      expect(delays[0]).toBeGreaterThanOrEqual(500);
      expect(delays[0]).toBeLessThan(1500);
    } finally {
      spy.mockRestore();
    }
  });

  it("ignores a CAP line it did not ask for, NEW among them", async () => {
    const ergo = await fakeErgo();
    const { lines } = start(ergo.port);
    const peer = await ergo.peer(0);
    await peer.next(/^CAP REQ /);
    peer.say(":ergo.test CAP gnoworld NEW :sasl");
    peer.say(":ergo.test CAP * ACK :message-tags account-tag");
    expect(await peer.next(/^CAP END$/)).toBe("CAP END");
    expect([ergo.peers.length, lines.filter((line) => line.includes("irc_refused"))]).toEqual([1, []]);
  });

  it("says it is ready once Ergo makes it an operator, and not before", async () => {
    const ergo = await fakeErgo();
    const { lines } = start(ergo.port);
    const peer = await ergo.peer(0);
    await peer.next(/^CAP REQ /);
    peer.say(":ergo.test CAP * ACK :message-tags account-tag");
    peer.say(":ergo.test 001 gnoworld :Welcome");
    await peer.next(/^OPER /);
    const ready = () => lines.filter((line) => line.includes('"event":"irc_ready"'));
    expect(ready()).toEqual([]);
    peer.say(":ergo.test 381 gnoworld :You are now an IRC operator");
    await expect.poll(ready).toHaveLength(1);
  });

  it("joins no name that is no room: one without its #, or with a # inside", async () => {
    const ergo = await fakeErgo();
    start(ergo.port, { rooms: () => ["bubble", "x#y", "#ok"] });
    const peer = await ergo.peer(0);
    await welcome(peer);
    await sync(peer);
    expect(peer.lines.filter((line) => line.startsWith("JOIN"))).toEqual(["JOIN #ok"]);
  });

  it("fills a JOIN line to exactly 510 bytes, and no further", async () => {
    const ergo = await fakeErgo();
    // "JOIN " and two rooms of 252 with their comma: 510 bytes.
    const [a, b, c] = [`#${"a".repeat(251)}`, `#${"b".repeat(251)}`, `#${"c".repeat(251)}`];
    start(ergo.port, { rooms: () => [a, b, c] });
    const peer = await ergo.peer(0);
    await welcome(peer);
    await sync(peer);
    const joins = peer.lines.filter((line) => line.startsWith("JOIN"));
    expect(joins).toEqual([`JOIN ${a},${b}`, `JOIN ${c}`]);
    expect(Buffer.byteLength(joins[0] ?? "")).toBe(510);
  });

  it("skips a room whose JOIN line could not be written, joins the rest, and stays up", async () => {
    const ergo = await fakeErgo();
    start(ergo.port, { rooms: () => [`#${"a".repeat(600)}`, "#ok"] });
    const peer = await ergo.peer(0);
    await welcome(peer);
    await sync(peer);
    expect([peer.lines.filter((line) => line.startsWith("JOIN")), ergo.peers.length]).toEqual([["JOIN #ok"], 1]);
  });

  it("logs a handler's throw and connects again, rather than ending the process", async () => {
    const ergo = await fakeErgo();
    const { lines } = start(ergo.port, {
      onMessage: () => {
        throw new Error("a database that fails");
      },
    });
    const peer = await ergo.peer(0);
    await welcome(peer);
    peer.say(message("account=g1a;msgid=m1", "a!u@h", ["#bubble", "hello"]));
    await welcome(await ergo.peer(1));
    expect(lines.filter((line) => line.includes('"event":"irc_error"'))).toEqual([
      expect.stringContaining('"error":"Error"'),
    ]);
  });

  it("reads a line ended by a bare LF", async () => {
    const ergo = await fakeErgo();
    start(ergo.port);
    const peer = await ergo.peer(0);
    await welcome(peer);
    peer.socket.write("PING :abc\n");
    expect(await peer.next(/^PONG /)).toBe("PONG abc");
  });
});

describe("the IRC link's own commands (3j)", () => {
  it("sends REDACT and NOTICE once it is in its rooms, and nothing before", async () => {
    const ergo = await fakeErgo();
    const { link } = start(ergo.port);
    const peer = await ergo.peer(0);
    expect(link.send("REDACT", ["#bubble", "m1", "harassment"])).toBe(false);
    await welcome(peer);
    expect(link.send("REDACT", ["#bubble", "m1", "harassment"])).toBe(true);
    expect(link.send("NOTICE", ["g1abc", "Your message in #bubble was hidden: harassment."])).toBe(true);
    expect(await peer.next(/^REDACT /)).toBe("REDACT #bubble m1 harassment");
    expect(await peer.next(/^NOTICE /)).toBe("NOTICE g1abc :Your message in #bubble was hidden: harassment.");
  });

  it("sends nothing once its connection is gone, until it is in its rooms again", async () => {
    const ergo = await fakeErgo();
    const { link } = start(ergo.port);
    const peer = await ergo.peer(0);
    await welcome(peer);
    peer.socket.destroy();
    await expect.poll(() => link.send("REDACT", ["#bubble", "m1", "x"])).toBe(false);
    const again = await ergo.peer(1);
    await welcome(again);
    expect(link.send("REDACT", ["#bubble", "m1", "x"])).toBe(true);
    expect(await again.next(/^REDACT /)).toBe("REDACT #bubble m1 x");
  });

  it.each([
    ["a command off its list", "KILL", ["someone", "bye"]],
    ["a line formatLine would refuse", "NOTICE", ["g1abc", "a\r\nQUIT :gone"]],
    ["an id with a space", "REDACT", ["#bubble", "m 1", "x"]],
    ["a NOTICE to a room", "NOTICE", ["#bubble", "x"]],
    ["a NOTICE to two targets", "NOTICE", ["g1a,g1b", "x"]],
    ["a NOTICE to nobody", "NOTICE", ["", "x"]],
    ["a REDACT outside a room", "REDACT", ["g1abc", "m1", "x"]],
    ["a REDACT in two rooms", "REDACT", ["#bubble,#earth", "m1", "x"]],
  ])("refuses %s, sending nothing", async (_, command, params) => {
    const ergo = await fakeErgo();
    const { link } = start(ergo.port);
    const peer = await ergo.peer(0);
    await welcome(peer);
    const mark = peer.lines.length;
    expect(link.send(command as "NOTICE", params)).toBe(false);
    await sync(peer);
    expect(since(peer, mark)).toEqual(["PONG sync"]);
  });
});

describe("the IRC link's catch-up (3j)", () => {
  const T = (n: number) => `2026-10-22T08:00:${String(n).padStart(2, "0")}.000Z`;
  // A page of the room's history as Ergo sends it: a chathistory batch of PRIVMSGs, each tagged with it.
  const page = (peer: Peer, ref: string, lines: { id: string; time: string; account?: string }[]): void => {
    peer.say(`:ergo.test BATCH +${ref} chathistory #bubble`);
    for (const { id, time, account = "g1a" } of lines) {
      const tags = `batch=${ref};${account === "" ? "" : `account=${account};`}msgid=${id};time=${time}`;
      peer.say(message(tags, "a!u@h", ["#bubble", `line ${id}`]));
    }
    peer.say(`:ergo.test BATCH -${ref}`);
  };
  const full = (from: number) => Array.from({ length: 50 }, (_, n) => ({ id: `p${String(from + n)}`, time: T(n) }));
  const asked = (peer: Peer) => peer.lines.filter((line) => line.startsWith("CHATHISTORY"));

  it("asks each room's history from just before its mark's time, page by page, and hands each on with its time", async () => {
    const ergo = await fakeErgo();
    const { said } = start(ergo.port, { lastChecked: (room) => (room === "#bubble" ? T(5) : undefined) });
    const peer = await ergo.peer(0);
    await welcome(peer);
    expect(await peer.next(/^CHATHISTORY /)).toBe("CHATHISTORY AFTER #bubble timestamp=2026-10-22T08:00:04.999Z 50");
    page(peer, "a", full(0));
    expect(await peer.next(/^CHATHISTORY /)).toBe(`CHATHISTORY AFTER #bubble timestamp=${T(49)} 50`);
    page(peer, "b", [
      { id: "q1", time: T(50) },
      { id: "q2", time: T(51) },
    ]);
    await sync(peer);
    expect(asked(peer)).toHaveLength(2);
    await expect.poll(() => said.length).toBe(52);
    expect(said[51]).toEqual({ room: "#bubble", account: "g1a", msgid: "q2", text: "line q2", time: T(51) });
  });

  it("asks nothing of a room it has never checked", async () => {
    const ergo = await fakeErgo();
    start(ergo.port, { lastChecked: () => undefined });
    const peer = await ergo.peer(0);
    await welcome(peer);
    await sync(peer);
    expect(asked(peer)).toEqual([]);
  });

  it("stops after a full page followed by an empty one, and after an empty first page", async () => {
    const ergo = await fakeErgo();
    start(ergo.port, { lastChecked: (room) => (room === "#bubble" ? T(0) : undefined) });
    const peer = await ergo.peer(0);
    await welcome(peer);
    await peer.next(/^CHATHISTORY /);
    page(peer, "a", full(0));
    await peer.next(/^CHATHISTORY /);
    page(peer, "b", []);
    await sync(peer);
    expect(asked(peer)).toHaveLength(2);
    const other = await fakeErgo();
    start(other.port, { lastChecked: (room) => (room === "#bubble" ? T(0) : undefined) });
    const lone = await other.peer(0);
    await welcome(lone);
    await lone.next(/^CHATHISTORY /);
    page(lone, "c", []);
    await sync(lone);
    expect(asked(lone)).toHaveLength(1);
  });

  it("takes the next page from a full page's last line, even one it does not hand on", async () => {
    const ergo = await fakeErgo();
    const { said } = start(ergo.port, { lastChecked: (room) => (room === "#bubble" ? T(0) : undefined) });
    const peer = await ergo.peer(0);
    await welcome(peer);
    await peer.next(/^CHATHISTORY /);
    page(peer, "a", [...full(0).slice(0, 49), { id: "anon", time: T(59), account: "" }]);
    expect(await peer.next(/^CHATHISTORY /)).toBe(`CHATHISTORY AFTER #bubble timestamp=${T(59)} 50`);
    await expect.poll(() => said.length).toBe(49);
  });

  it("asks the next page only once what it handed on is taken in", async () => {
    let drain = (): void => undefined;
    const ergo = await fakeErgo();
    start(ergo.port, {
      lastChecked: (room) => (room === "#bubble" ? T(0) : undefined),
      drained: () =>
        new Promise<void>((resolve) => {
          drain = resolve;
        }),
    });
    const peer = await ergo.peer(0);
    await welcome(peer);
    await peer.next(/^CHATHISTORY /);
    page(peer, "a", full(0));
    await sync(peer);
    expect(asked(peer)).toHaveLength(1);
    drain();
    expect(await peer.next(/^CHATHISTORY /)).toBe(`CHATHISTORY AFTER #bubble timestamp=${T(49)} 50`);
  });
});

describe("retryDelay", () => {
  it("doubles from a second to a minute, jittered by half either way", () => {
    expect([0, 1, 2, 5, 6, 30].map((attempt) => retryDelay(attempt, () => 0.5))).toEqual([
      1000, 2000, 4000, 32_000, 60_000, 60_000,
    ]);
    expect([retryDelay(0, () => 0), retryDelay(0, () => 0.999)]).toEqual([500, 1499]);
    expect(retryDelay(9, () => 0)).toBe(30_000);
  });
});
