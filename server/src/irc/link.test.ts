import { once } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import { logger } from "../log.ts";
import fc from "fast-check";
import { freePort } from "../testing/ergo.ts";
import { fakeErgo, message, PASSWORD, register, welcome, type Peer } from "../testing/fakeErgo.ts";
import { ircLink, retryDelay, type Link, type Said } from "./link.ts";

const CAPS = "CAP REQ :message-tags account-tag batch draft/chathistory server-time multi-prefix sasl";
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
  it("asks its capabilities, logs in as its account by SASL, as an operator, then joins its rooms", async () => {
    const ergo = await fakeErgo();
    start(ergo.port);
    const peer = await ergo.peer(0);
    expect(await peer.next(/^CAP /)).toBe(CAPS);
    expect(await peer.next(/^NICK /)).toBe("NICK gnoworld");
    expect(await peer.next(/^USER /)).toBe("USER gnoworld 0 * gno.world");
    peer.say(":ergo.test CAP * ACK :message-tags account-tag batch draft/chathistory server-time multi-prefix sasl");
    expect(await peer.next(/^AUTHENTICATE /)).toBe("AUTHENTICATE PLAIN");
    peer.say("AUTHENTICATE +");
    expect(await peer.next(/^AUTHENTICATE /)).toBe(
      `AUTHENTICATE ${Buffer.from(`\0gnoworld\0${PASSWORD}`).toString("base64")}`,
    );
    peer.say(":ergo.test 903 gnoworld :SASL authentication successful");
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

  it("hands on a message of its rooms with the account and id Ergo set, a NOTICE too, and nothing else", async () => {
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
    peer.say("@msgid=n1 :guest!u@h NOTICE #bubble :no account");
    peer.say("@account=g1alice;msgid=n2 :alice!u@h NOTICE gnoworld :to the bot");
    peer.say("@account=gnoworld;msgid=n3 :gnoworld!u@h NOTICE #bubble :its own");
    peer.say("@account=g1alice;msgid=n4 :alice!u@h NOTICE #elsewhere :not its room");
    peer.say(message("account=g1bob;msgid=m7", "bob!u@h", ["#earth", "last"]));
    await expect.poll(() => said.length).toBe(3);
    expect(said).toEqual([
      { room: "#bubble", account: "g1alice", msgid: "m1", text: "hello world" },
      { room: "#bubble", account: "g1alice", msgid: "m6", text: "a notice" },
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
    await welcome(first, { echo: false });
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
    await register(peer);
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
      await register(peer);
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
    await register(peer);
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
    peer.say(":ergo.test CAP gnoworld NEW :sasl");
    await register(peer);
    expect([ergo.peers.length, lines.filter((line) => line.includes("irc_refused"))]).toEqual([1, []]);
  });

  it("says it is ready once Ergo makes it an operator, and not before", async () => {
    const ergo = await fakeErgo();
    const { lines } = start(ergo.port);
    const peer = await ergo.peer(0);
    await register(peer);
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

  it("gives itself a room's op back, and nobody else (the max review)", async () => {
    const ergo = await fakeErgo();
    const { link } = start(ergo.port);
    const peer = await ergo.peer(0);
    await welcome(peer);
    expect(link.send("SAMODE", ["#bubble", "+o", "gnoworld"])).toBe(true);
    expect(await peer.next(/^SAMODE /)).toBe("SAMODE #bubble +o gnoworld");
    expect(link.send("SAMODE", ["#bubble", "+o", "g1abc"])).toBe(false);
    expect(link.send("SAMODE", ["#bubble", "+q", "gnoworld"])).toBe(false);
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

  it.each<[string, string, readonly string[]]>([
    ["a command off its list", "KILL", ["someone", "bye"]],
    ["a line formatLine would refuse", "NOTICE", ["g1abc", "a\r\nQUIT :gone"]],
    ["an id with a space", "REDACT", ["#bubble", "m 1", "x"]],
    ["a NOTICE to a room", "NOTICE", ["#bubble", "x"]],
    ["a NOTICE to two targets", "NOTICE", ["g1a,g1b", "x"]],
    ["a NOTICE to nobody", "NOTICE", ["", "x"]],
    ["a REDACT outside a room", "REDACT", ["g1abc", "m1", "x"]],
    ["a REDACT in two rooms", "REDACT", ["#bubble,#earth", "m1", "x"]],
    ["a SAMODE outside a room (3k)", "SAMODE", ["g1abc", "+b", "m:g1abc"]],
    ["a SAMODE that is no ban (3k)", "SAMODE", ["#bubble", "+o", "g1abc"]],
    ["a ban that mutes no one by name (3k)", "SAMODE", ["#bubble", "+b", "g1abc"]],
    ["a ban after another mode in one word (3j's green pass)", "SAMODE", ["#bubble", "+o+b", "m:g1abc"]],
    ["a mute's mask behind another (3j's green pass)", "SAMODE", ["#bubble", "+b", "x:m:g1abc"]],
    ["a mute of everyone (3k)", "SAMODE", ["#bubble", "+b", "m:*"]],
    ["a mute by mask (3k)", "SAMODE", ["#bubble", "+b", "m:g1abc!*@*"]],
    ["a mute of two (3k)", "SAMODE", ["#bubble", "+b", "m:g1a,g1b"]],
    ["a SAMODE with a fourth word (3k)", "SAMODE", ["#bubble", "+b", "m:g1a", "x"]],
    ["a mute of nobody (3k)", "SAMODE", ["#bubble", "+b", "m:"]],
    ["a mute ending in a wildcard (3k)", "SAMODE", ["#bubble", "+b", "m:g1a*"]],
    ["a mute with a ? wildcard (3k)", "SAMODE", ["#bubble", "+b", "m:g1a?"]],
    ["a SAMODE in two rooms (3k)", "SAMODE", ["#bubble,#earth", "+b", "m:g1a"]],
    ["a mode of two letters (3k)", "SAMODE", ["#bubble", "+bb", "m:g1a"]],
    ["a ban and an op at once (3k)", "SAMODE", ["#bubble", "+bo", "m:g1a"]],
    ["a capital B (3k)", "SAMODE", ["#bubble", "+B", "m:g1a"]],
    ["an unmute of everyone (3k)", "SAMODE", ["#bubble", "-b", "m:*"]],
    ["a line break in the account (3k)", "SAMODE", ["#bubble", "+b", "m:g1a\r\nQUIT"]],
    ["an account of 600 bytes (3k)", "SAMODE", ["#bubble", "+b", `m:${"a".repeat(600)}`]],
    ["a JOIN of two rooms (3l)", "JOIN", ["#bubble,#earth"]],
    ["a JOIN outside a room (3l)", "JOIN", ["bubble"]],
    ["a JOIN with a key (3l)", "JOIN", ["#bubble", "secret"]],
    ["a room's mode with a word after it (3l)", "SAMODE", ["#bubble", "+M", "x"]],
    ["a room's mode the bot never sets (3l)", "SAMODE", ["#bubble", "+o"]],
    ["two modes at once (3l)", "SAMODE", ["#bubble", "+ms"]],
    ["a mode taken off with a word after it (3m)", "SAMODE", ["#bubble", "-M", "x"]],
    ["an op given (3m)", "SAMODE", ["#bubble", "+o", "g1abc"]],
    ["a half-op given (3m)", "SAMODE", ["#bubble", "+h", "g1abc"]],
    ["a voice to no one (3m)", "SAMODE", ["#bubble", "+v"]],
    ["a voice to two (3m)", "SAMODE", ["#bubble", "+v", "g1a,g1b"]],
    ["an invite mask by wildcard (3m)", "SAMODE", ["#bubble", "+I", "*!*@*"]],
    ["an invite to an account with a line break (3m)", "SAMODE", ["#bubble", "+I", "g1a\r\nQUIT"]],
    ["a voice and an op at once (3m)", "SAMODE", ["#bubble", "+vo", "g1a", "g1a"]],
    ["an op and a voice at once (3m)", "SAMODE", ["#bubble", "+ov", "g1a"]],
    ["a voice given and taken at once (3m)", "SAMODE", ["#bubble", "+v-v", "g1a"]],
    ["a flag and a voice at once (3m)", "SAMODE", ["#bubble", "+iv", "g1a"]],
    ["an op taken and given at once (3m)", "SAMODE", ["#bubble", "-o+o", "g1a"]],
    ["a voice taken from two (3m)", "SAMODE", ["#bubble", "-v", "g1a,g1b"]],
    ["an op taken from two (3m)", "SAMODE", ["#bubble", "-o", "alice,bob"]],
    ["an invite taken from two (3m)", "SAMODE", ["#bubble", "-I", "g1a,g1b"]],
    ["a voice taken with a line break (3m)", "SAMODE", ["#bubble", "-v", "g1a\r\nQUIT"]],
    ["an op taken with a line break (3m)", "SAMODE", ["#bubble", "-o", "g1a\nQUIT"]],
    ["a founder taken with a line break (3m)", "SAMODE", ["#bubble", "-q", "g1a\rQUIT"]],
    ["an invite taken with a line break (3m)", "SAMODE", ["#bubble", "-I", "g1a\r\nQUIT"]],
    ["a voice taken from everyone (3m)", "SAMODE", ["#bubble", "-v", "*"]],
    ["an op taken from everyone (3m)", "SAMODE", ["#bubble", "-o", "*"]],
    ["the bot's own op taken (3m)", "SAMODE", ["#bubble", "-o", "gnoworld"]],
    ["the bot's own founder taken (3m)", "SAMODE", ["#bubble", "-q", "gnoworld"]],
    ["a KICK of the bot (3m)", "KICK", ["#bubble", "gnoworld", "x"]],
    ["a KICK of two (3m)", "KICK", ["#bubble", "g1a,g1b", "x"]],
    ["a KICK in two rooms (3m)", "KICK", ["#bubble,#earth", "g1a", "x"]],
    ["a KICK with no reason (3m)", "KICK", ["#bubble", "g1a"]],
    ["no mode (3l)", "SAMODE", ["#bubble"]],
    ["a mode with no sign (3l)", "SAMODE", ["#bubble", "M"]],
    ["a ban with no mask (3l)", "SAMODE", ["#bubble", "+b"]],
    // Every mode letter but the room flags the reconciler sets (M, m, i, s, R), put on and taken off.
    ...[97, 65]
      .flatMap((first) => Array.from({ length: 26 }, (_, n) => String.fromCharCode(first + n)))
      .filter((letter) => !["M", "m", "i", "s", "R"].includes(letter))
      .flatMap((letter) =>
        ["+", "-"].map((sign): [string, string, readonly string[]] => [
          `a room's ${sign}${letter} (3l)`,
          "SAMODE",
          ["#bubble", `${sign}${letter}`],
        ]),
      ),
    ["JOIN 0, which leaves every room (3l)", "JOIN", ["0"]],
    ["a JOIN of # alone (3l)", "JOIN", ["#"]],
    ["a JOIN with a line break (3l)", "JOIN", ["#a\r\nQUIT"]],
    ["a JOIN with NUL (3l)", "JOIN", ["#a\u0000b"]],
    ["a JOIN with a space (3l)", "JOIN", ["#a b"]],
    ["a JOIN of 600 bytes (3l)", "JOIN", [`#${"a".repeat(600)}`]],
    ["a JOIN of nothing (3l)", "JOIN", []],
    ["a room of 65 characters (3l)", "JOIN", [`#${"a".repeat(64)}`]],
    ["a SAMODE room with a line break (3l)", "SAMODE", ["#a\nb", "+M"]],
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

describe("the IRC link's mute and edits (3k)", () => {
  it("puts a mute on and takes it off with SAMODE, once in its rooms", async () => {
    const ergo = await fakeErgo();
    const { link } = start(ergo.port);
    const peer = await ergo.peer(0);
    expect(link.send("SAMODE", ["#bubble", "+b", "m:g1abc"])).toBe(false);
    await welcome(peer);
    const address = "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5";
    expect(link.send("SAMODE", ["#bubble", "+b", `m:${address}`])).toBe(true);
    expect(link.send("SAMODE", ["#bubble", "-b", `m:${address}`])).toBe(true);
    expect(await peer.next(/^SAMODE /)).toBe(`SAMODE #bubble +b m:${address}`);
    expect(await peer.next(/^SAMODE /)).toBe(`SAMODE #bubble -b m:${address}`);
  });

  it("says when it is in its rooms, each time it comes back", async () => {
    const ergo = await fakeErgo();
    let ready = 0;
    start(ergo.port, {
      onReady: () => {
        ready += 1;
      },
    });
    const peer = await ergo.peer(0);
    await welcome(peer);
    await expect.poll(() => ready).toBe(1);
    peer.socket.destroy();
    await welcome(await ergo.peer(1));
    await expect.poll(() => ready).toBe(2);
  });

  it("hands on the id a line says it corrects, and none empty or past 128 characters", async () => {
    const ergo = await fakeErgo();
    const { said } = start(ergo.port);
    const peer = await ergo.peer(0);
    await welcome(peer);
    peer.say(message("account=g1a;msgid=m2;+gnoworld/edit=m1", "a!u@h", ["#bubble", "fixed"]));
    peer.say(message("account=g1a;msgid=m3;+gnoworld/edit=", "a!u@h", ["#bubble", "plain"]));
    peer.say(message(`account=g1a;msgid=m4;+gnoworld/edit=${"x".repeat(129)}`, "a!u@h", ["#bubble", "long"]));
    await expect.poll(() => said.length).toBe(3);
    expect(said).toEqual([
      { room: "#bubble", account: "g1a", msgid: "m2", text: "fixed", edits: "m1" },
      { room: "#bubble", account: "g1a", msgid: "m3", text: "plain" },
      { room: "#bubble", account: "g1a", msgid: "m4", text: "long" },
    ]);
  });
});

describe("the IRC link's rooms (3l)", () => {
  it("joins a room it is asked to, sets its modes, and hands on its lines once Ergo says it joined", async () => {
    const ergo = await fakeErgo();
    const { link, said } = start(ergo.port);
    const peer = await ergo.peer(0);
    await welcome(peer);
    expect(link.send("JOIN", ["#bubble/garden"])).toBe(true);
    for (const mode of ["+M", "+m", "+s"]) expect(link.send("SAMODE", ["#bubble/garden", mode])).toBe(true);
    expect(await peer.next(/^JOIN #bubble\/garden$/)).toBe("JOIN #bubble/garden");
    expect([await peer.next(/^SAMODE /), await peer.next(/^SAMODE /), await peer.next(/^SAMODE /)]).toEqual([
      "SAMODE #bubble/garden +M",
      "SAMODE #bubble/garden +m",
      "SAMODE #bubble/garden +s",
    ]);
    peer.say(message("account=g1a;msgid=m0", "a!u@h", ["#bubble/garden", "too soon"]));
    peer.say(":gnoworld!u@h JOIN #bubble/garden");
    peer.say(message("account=g1a;msgid=m1", "a!u@h", ["#bubble/garden", "hello"]));
    await expect.poll(() => said.map(({ msgid }) => msgid)).toEqual(["m1"]);
  });

  it("joins a room of 64 characters, Ergo's longest", async () => {
    const ergo = await fakeErgo();
    const { link } = start(ergo.port);
    const peer = await ergo.peer(0);
    await welcome(peer);
    const room = `#${"a".repeat(63)}`;
    expect(link.send("JOIN", [room])).toBe(true);
    expect(await peer.next(/^JOIN #a/)).toBe(`JOIN ${room}`);
  });

  it("takes no room as joined from another's JOIN, nor from its own JOIN of a room it never asked", async () => {
    const ergo = await fakeErgo();
    const { link, said } = start(ergo.port);
    const peer = await ergo.peer(0);
    await welcome(peer);
    link.send("JOIN", ["#bubble/garden"]);
    peer.say(":alice!u@h JOIN #bubble/garden");
    peer.say(":gnoworld!u@h JOIN #rogue");
    peer.say(message("account=g1a;msgid=m1", "a!u@h", ["#bubble/garden", "not yet"]));
    peer.say(message("account=g1a;msgid=m2", "a!u@h", ["#rogue", "never"]));
    peer.say(":gnoworld!u@h JOIN #bubble/garden");
    peer.say(message("account=g1a;msgid=m3", "a!u@h", ["#bubble/garden", "now"]));
    await expect.poll(() => said.map(({ msgid }) => msgid)).toEqual(["m3"]);
    await sync(peer);
    expect(said.map(({ msgid }) => msgid)).toEqual(["m3"]);
  });

  it("takes a room as asked by its JOIN alone, never by another command, and forgets it with its connection (F572)", async () => {
    const ergo = await fakeErgo();
    const { link, said } = start(ergo.port);
    const peer = await ergo.peer(0);
    await welcome(peer);
    expect(link.send("SAMODE", ["#x", "+M"])).toBe(true);
    peer.say(":gnoworld!u@h JOIN #x");
    peer.say(message("account=g1a;msgid=m1", "a!u@h", ["#x", "never"]));
    link.send("JOIN", ["#y"]);
    await sync(peer);
    peer.socket.destroy();
    const again = await ergo.peer(1);
    await welcome(again);
    again.say(":gnoworld!u@h JOIN #y");
    again.say(message("account=g1a;msgid=m2", "a!u@h", ["#y", "nor this"]));
    again.say(message("account=g1a;msgid=m3", "a!u@h", ["#bubble", "this"]));
    await expect.poll(() => said.map(({ msgid }) => msgid)).toEqual(["m3"]);
  });

  it("asks no list when no one listens", async () => {
    const ergo = await fakeErgo();
    start(ergo.port);
    const peer = await ergo.peer(0);
    await welcome(peer);
    await sync(peer);
    expect(peer.lines.filter((line) => line.startsWith("LIST"))).toEqual([]);
  });

  it("starts a list again on each connection, a list cut by a close forgotten", async () => {
    const ergo = await fakeErgo();
    const found: string[][] = [];
    start(ergo.port, { onChannels: (names) => found.push([...names]) });
    const peer = await ergo.peer(0);
    await welcome(peer);
    await peer.next(/^LIST/);
    peer.say(":ergo.test 322 gnoworld #old 1 :");
    peer.socket.destroy();
    const again = await ergo.peer(1);
    await welcome(again);
    await again.next(/^LIST/);
    again.say(":ergo.test 322 gnoworld #bubble 1 :");
    again.say(":ergo.test 323 gnoworld :End of /LIST");
    await expect.poll(() => found).toEqual([["#bubble"]]);
  });

  it("keeps at most 10,000 names of a list, and none from a 322 that names no channel", async () => {
    const ergo = await fakeErgo();
    const found: string[][] = [];
    start(ergo.port, { onChannels: (names) => found.push([...names]) });
    const peer = await ergo.peer(0);
    await welcome(peer);
    await peer.next(/^LIST/);
    peer.say(":ergo.test 322 gnoworld");
    for (let n = 0; n < 10_005; n += 1) peer.say(`:ergo.test 322 gnoworld #r${String(n)} 1 :`);
    peer.say(":ergo.test 323 gnoworld :End of /LIST");
    await expect.poll(() => found.length, { timeout: 15_000 }).toBe(1);
    expect(found[0]).toHaveLength(10_000);
    expect(found[0]?.[0]).toBe("#r0");
  });

  it("lists Ergo's channels once in its rooms, and says which it found", async () => {
    const ergo = await fakeErgo();
    const found: string[][] = [];
    start(ergo.port, { onChannels: (names) => found.push([...names]) });
    const peer = await ergo.peer(0);
    await welcome(peer);
    expect(await peer.next(/^LIST/)).toBe("LIST");
    peer.say(":ergo.test 321 gnoworld Channel :Users  Name");
    peer.say(":ergo.test 322 gnoworld #bubble 2 :");
    peer.say(":ergo.test 322 gnoworld #rogue 1 :a topic");
    peer.say(":ergo.test 323 gnoworld :End of /LIST");
    await expect.poll(() => found).toEqual([["#bubble", "#rogue"]]);
  });
});

describe("the IRC link's room state (3m)", () => {
  it("puts a room's flags, its invite list, voices and the others' powers in the forms it allows", async () => {
    const ergo = await fakeErgo();
    const { link } = start(ergo.port);
    const peer = await ergo.peer(0);
    await welcome(peer);
    const address = "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5";
    const lines = [
      ["#bubble", "+i"],
      ["#bubble", "-i"],
      ["#bubble", "+R"],
      ["#bubble", "-s"],
      ["#bubble", "-m"],
      ["#bubble", "+I", address],
      ["#bubble", "-I", address],
      ["#bubble", "+v", address],
      ["#bubble", "-v", address],
      ["#bubble", "-o", "alice"],
      ["#bubble", "-h", "alice"],
      ["#bubble", "-a", "alice"],
      ["#bubble", "-q", "alice"],
    ];
    for (const params of lines) expect(link.send("SAMODE", params)).toBe(true);
    const seen: string[] = [];
    while (seen.length < lines.length) seen.push(await peer.next(/^SAMODE /));
    expect(seen).toEqual(lines.map((params) => ["SAMODE", ...params].join(" ")));
  });

  it("takes off an invite by any mask, and puts one out of a room", async () => {
    const ergo = await fakeErgo();
    const { link } = start(ergo.port);
    const peer = await ergo.peer(0);
    await welcome(peer);
    expect(link.send("SAMODE", ["#bubble", "-I", "*!*@*"])).toBe(true);
    expect(link.send("KICK", ["#bubble", "g1gone", "not on this room's list"])).toBe(true);
    expect(await peer.next(/^SAMODE /)).toBe("SAMODE #bubble -I *!*@*");
    expect(await peer.next(/^KICK /)).toBe("KICK #bubble g1gone :not on this room's list");
  });

  it("reads a secret room's names over several lines, a wildcard invite and a hundred of them", async () => {
    const ergo = await fakeErgo();
    const { link } = start(ergo.port);
    const peer = await ergo.peer(0);
    await welcome(peer);
    const asked = link.state("#bubble");
    await peer.next(/^NAMES /);
    peer.say(":ergo.test 324 gnoworld #bubble +Mis");
    for (let n = 0; n < 100; n += 1) peer.say(`:ergo.test 346 gnoworld #bubble g${String(n)}!*@* gnoworld 1`);
    peer.say(":ergo.test 346 gnoworld #bubble *!*@* gnoworld 1");
    peer.say(":ergo.test 347 gnoworld #bubble :End");
    peer.say(":ergo.test 353 gnoworld @ #bubble :~@gnoworld +g1a");
    peer.say(":ergo.test 353 gnoworld @ #bubble :g1b @alice");
    peer.say(":ergo.test 366 gnoworld #bubble :End");
    const got = await asked;
    expect(got?.invites).toHaveLength(101);
    expect(got?.invites.slice(-2)).toEqual(["g99", "*!*@*"]);
    expect(got?.present.map(({ nick }) => nick)).toEqual(["gnoworld", "g1a", "g1b", "alice"]);
  });

  it("answers no state at once for a room Ergo says does not exist", async () => {
    const ergo = await fakeErgo();
    const { link } = start(ergo.port, { stateMs: 60_000 });
    const peer = await ergo.peer(0);
    await welcome(peer);
    const asked = link.state("#gone");
    await peer.next(/^MODE #gone$/);
    peer.say(":ergo.test 403 gnoworld #gone :No such channel");
    expect(await asked).toBeUndefined();
  });

  it("reads any NAMES line without throwing, and hands on no nick with a space, a comma or a control", async () => {
    const ergo = await fakeErgo();
    const { link } = start(ergo.port);
    const peer = await ergo.peer(0);
    await welcome(peer);
    await fc.assert(
      fc.asyncProperty(fc.string({ unit: "binary", maxLength: 60 }), async (names) => {
        const asked = link.state("#bubble");
        await peer.next(/^NAMES #bubble$/);
        peer.say(":ergo.test 324 gnoworld #bubble +M");
        peer.say(":ergo.test 347 gnoworld #bubble :End");
        peer.say(`:ergo.test 353 gnoworld = #bubble :${names.replace(/[\r\n\0]/g, "")}`);
        peer.say(":ergo.test 366 gnoworld #bubble :End");
        for (const { nick } of (await asked)?.present ?? []) expect(nick).toMatch(/^[^\s,\0-\x1f]+$/);
      }),
      { numRuns: 50 },
    );
  });

  it("reads a room's state from Ergo: its flags, its invite list and who is in it with what power", async () => {
    const ergo = await fakeErgo();
    const { link } = start(ergo.port);
    const peer = await ergo.peer(0);
    await welcome(peer);
    const asked = link.state("#bubble");
    expect(await peer.next(/^MODE #bubble$/)).toBe("MODE #bubble");
    // Listed by SAMODE: Ergo lists the invites to a channel operator alone, which a bot back by SAJOIN is not.
    expect(await peer.next(/^SAMODE #bubble I$/)).toBe("SAMODE #bubble I");
    expect(await peer.next(/^NAMES #bubble$/)).toBe("NAMES #bubble");
    peer.say(":ergo.test 324 gnoworld #bubble +Mnt");
    peer.say(":ergo.test 346 gnoworld #bubble g1a!*@* gnoworld 1");
    peer.say(":ergo.test 346 gnoworld #bubble g1b gnoworld 1");
    peer.say(":ergo.test 347 gnoworld #bubble :End of Channel Invite Exception List");
    peer.say(":ergo.test 353 gnoworld = #bubble :~@gnoworld +g1a @alice g1c");
    peer.say(":ergo.test 366 gnoworld #bubble :End of NAMES list");
    expect(await asked).toEqual({
      flags: "Mnt",
      invites: ["g1a", "g1b"],
      present: [
        { nick: "gnoworld", powers: "~@" },
        { nick: "g1a", powers: "+" },
        { nick: "alice", powers: "@" },
        { nick: "g1c", powers: "" },
      ],
    });
  });

  it("answers no state for a room Ergo does not answer for, nor before it is in its rooms", async () => {
    const ergo = await fakeErgo();
    const { link } = start(ergo.port, { stateMs: 50 });
    const peer = await ergo.peer(0);
    expect(await link.state("#bubble")).toBeUndefined();
    await welcome(peer);
    expect(await link.state("#bubble")).toBeUndefined();
  });

  it("joins by SAJOIN a room of its own that refuses it: full, invite-only, banned, keyed or accounts only", async () => {
    const ergo = await fakeErgo();
    start(ergo.port);
    const peer = await ergo.peer(0);
    await welcome(peer);
    for (const code of ["471", "473", "474", "475", "477"]) {
      peer.say(`:ergo.test ${code} gnoworld #bubble :Cannot join channel`);
      expect(await peer.next(/^SAJOIN /)).toBe("SAJOIN #bubble");
    }
  });

  it("joins by SAJOIN no room that is not its own, and no room for another refusal", async () => {
    const ergo = await fakeErgo();
    start(ergo.port);
    const peer = await ergo.peer(0);
    await welcome(peer);
    peer.say(":ergo.test 473 gnoworld #rogue :Cannot join channel (+i)");
    peer.say(":ergo.test 403 gnoworld #bubble :No such channel");
    peer.say(":ergo.test 476 gnoworld #bubble :Bad channel mask");
    peer.say("PING :settled");
    await peer.next(/^PONG settled$/);
    expect(peer.lines.filter((l) => l.startsWith("SAJOIN"))).toEqual([]);
  });

  it("hands on who joins one of its rooms, never itself nor a room not its own", async () => {
    const ergo = await fakeErgo();
    const joined: string[] = [];
    start(ergo.port, { onJoin: (room) => joined.push(room) });
    const peer = await ergo.peer(0);
    await welcome(peer);
    peer.say(":g1a!u@h JOIN #bubble");
    peer.say(":gnoworld!u@h JOIN #earth");
    peer.say(":g1a!u@h JOIN #rogue");
    peer.say(":g1b!u@h JOIN #earth g1b :real name");
    peer.say("PING :settled");
    await peer.next(/^PONG settled$/);
    expect(joined).toEqual(["#bubble", "#earth"]);
  });

  it("keeps two rooms' answers apart when asked at once", async () => {
    const ergo = await fakeErgo();
    const { link } = start(ergo.port);
    const peer = await ergo.peer(0);
    await welcome(peer);
    const [a, b] = [link.state("#a"), link.state("#b")];
    for (const room of ["#b", "#a"]) {
      peer.say(`:ergo.test 324 gnoworld ${room} +${room === "#a" ? "M" : "m"}`);
      peer.say(`:ergo.test 347 gnoworld ${room} :End`);
      peer.say(`:ergo.test 366 gnoworld ${room} :End`);
    }
    expect([(await a)?.flags, (await b)?.flags]).toEqual(["M", "m"]);
  });

  it("answers a room's state with nothing as soon as its connection closes, and asks it on the next (F566)", async () => {
    const ergo = await fakeErgo();
    const { link } = start(ergo.port, { stateMs: 60_000 });
    const peer = await ergo.peer(0);
    await welcome(peer);
    const asked = link.state("#bubble");
    await peer.next(/^NAMES #bubble$/);
    peer.socket.destroy();
    expect(await asked).toBeUndefined();
    const again = await ergo.peer(1);
    await welcome(again);
    const next = link.state("#bubble");
    await again.next(/^NAMES #bubble$/);
    again.say(":ergo.test 324 gnoworld #bubble +M");
    again.say(":ergo.test 366 gnoworld #bubble :End");
    expect((await next)?.flags).toBe("M");
  });

  it("asks no state before it is in its rooms, nor of a name that is no room, and answers those at once (F571)", async () => {
    const ergo = await fakeErgo();
    const { link } = start(ergo.port, { stateMs: 60_000 });
    const peer = await ergo.peer(0);
    expect(await link.state("#bubble")).toBeUndefined();
    await welcome(peer);
    for (const room of ["#a b", "#a\r\nQUIT", "bubble"]) expect(await link.state(room)).toBeUndefined();
    await sync(peer);
    expect(peer.lines.filter((line) => /^(MODE|SAMODE|NAMES|QUIT)/.test(line))).toEqual([]);
  });

  it("stays up on lines it never asked for: a list's end twice, a 322 after it, a batch's end it never opened, a JOIN with no source (F573)", async () => {
    const ergo = await fakeErgo();
    const found: string[][] = [];
    start(ergo.port, { onChannels: (names) => found.push([...names]) });
    const peer = await ergo.peer(0);
    await welcome(peer);
    await peer.next(/^LIST$/);
    peer.say(":ergo.test 323 gnoworld :End of /LIST");
    peer.say(":ergo.test 323 gnoworld :End of /LIST");
    peer.say(":ergo.test 322 gnoworld #late 1 :");
    peer.say(":ergo.test BATCH -zz");
    peer.say("JOIN #bubble");
    await sync(peer);
    expect([found, ergo.peers.length]).toEqual([[[]], 1]);
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
  // A millisecond before a time: the next page starts in the millisecond of the last line it read.
  const before = (time: string) => new Date(Date.parse(time) - 1).toISOString();
  // Twice: a page's end asks its next page a microtask after it is read, which one PONG may beat.
  const settled = async (peer: Peer) => {
    await sync(peer, "a");
    await sync(peer, "b");
  };

  it("asks each room's history from just before its mark's time, page by page, and hands each on with its time", async () => {
    const ergo = await fakeErgo();
    const { said } = start(ergo.port, { lastChecked: (room) => (room === "#bubble" ? T(5) : undefined) });
    const peer = await ergo.peer(0);
    await welcome(peer);
    expect(await peer.next(/^CHATHISTORY /)).toBe("CHATHISTORY AFTER #bubble timestamp=2026-10-22T08:00:04.999Z 50");
    page(peer, "a", full(0));
    expect(await peer.next(/^CHATHISTORY /)).toBe(`CHATHISTORY AFTER #bubble timestamp=${before(T(49))} 50`);
    page(peer, "b", [
      { id: "q1", time: T(50) },
      { id: "q2", time: T(51) },
    ]);
    await settled(peer);
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
    await settled(peer);
    expect(asked(peer)).toHaveLength(2);
    const other = await fakeErgo();
    start(other.port, { lastChecked: (room) => (room === "#bubble" ? T(0) : undefined) });
    const lone = await other.peer(0);
    await welcome(lone);
    await lone.next(/^CHATHISTORY /);
    page(lone, "c", []);
    await settled(lone);
    expect(asked(lone)).toHaveLength(1);
  });

  it("takes the next page from a full page's last line, even one it does not hand on", async () => {
    const ergo = await fakeErgo();
    const { said } = start(ergo.port, { lastChecked: (room) => (room === "#bubble" ? T(0) : undefined) });
    const peer = await ergo.peer(0);
    await welcome(peer);
    await peer.next(/^CHATHISTORY /);
    page(peer, "a", [...full(0).slice(0, 49), { id: "anon", time: T(59), account: "" }]);
    expect(await peer.next(/^CHATHISTORY /)).toBe(`CHATHISTORY AFTER #bubble timestamp=${before(T(59))} 50`);
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
    await settled(peer);
    expect(asked(peer)).toHaveLength(1);
    drain();
    expect(await peer.next(/^CHATHISTORY /)).toBe(`CHATHISTORY AFTER #bubble timestamp=${before(T(49))} 50`);
  });

  it("asks again from a full page's last millisecond, so a line beside its last one is not lost", async () => {
    const ergo = await fakeErgo();
    start(ergo.port, { lastChecked: (room) => (room === "#bubble" ? T(0) : undefined) });
    const peer = await ergo.peer(0);
    await welcome(peer);
    await peer.next(/^CHATHISTORY /);
    // Its last two lines in one millisecond: Ergo's next page from that millisecond holds the third.
    page(peer, "a", [...full(0).slice(0, 48), { id: "x1", time: T(48) }, { id: "x2", time: T(48) }]);
    expect(await peer.next(/^CHATHISTORY /)).toBe(`CHATHISTORY AFTER #bubble timestamp=${before(T(48))} 50`);
  });

  it("goes on past a full page in one millisecond, rather than ask it again forever", async () => {
    const ergo = await fakeErgo();
    start(ergo.port, { lastChecked: (room) => (room === "#bubble" ? T(5) : undefined) });
    const peer = await ergo.peer(0);
    await welcome(peer);
    expect(await peer.next(/^CHATHISTORY /)).toBe(`CHATHISTORY AFTER #bubble timestamp=${before(T(5))} 50`);
    page(
      peer,
      "a",
      Array.from({ length: 50 }, (_, n) => ({ id: `s${String(n)}`, time: T(5) })),
    );
    expect(await peer.next(/^CHATHISTORY /)).toBe(`CHATHISTORY AFTER #bubble timestamp=${T(5)} 50`);
  });

  it("pages on from the last time it can read when a line's time is not one, and stays up", async () => {
    const ergo = await fakeErgo();
    start(ergo.port, { lastChecked: (room) => (room === "#bubble" ? T(0) : undefined) });
    const peer = await ergo.peer(0);
    await welcome(peer);
    await peer.next(/^CHATHISTORY /);
    page(peer, "a", [...full(0).slice(0, 49), { id: "odd", time: "not-a-time" }]);
    expect(await peer.next(/^CHATHISTORY /)).toBe(`CHATHISTORY AFTER #bubble timestamp=${before(T(48))} 50`);
    expect(ergo.peers).toHaveLength(1);
  });

  it("asks no further page after a full page whose lines carry no time", async () => {
    const ergo = await fakeErgo();
    start(ergo.port, { lastChecked: (room) => (room === "#bubble" ? T(0) : undefined) });
    const peer = await ergo.peer(0);
    await welcome(peer);
    await peer.next(/^CHATHISTORY /);
    peer.say(":ergo.test BATCH +a chathistory #bubble");
    for (let n = 0; n < 50; n += 1)
      peer.say(message(`batch=a;account=g1a;msgid=t${String(n)}`, "a!u@h", ["#bubble", "x"]));
    peer.say(":ergo.test BATCH -a");
    await settled(peer);
    expect(asked(peer)).toHaveLength(1);
  });

  it("counts a NOTICE of a page as one of its lines: a full page with one asks the next (the max review)", async () => {
    const ergo = await fakeErgo();
    const { said } = start(ergo.port, { lastChecked: (room) => (room === "#bubble" ? T(0) : undefined) });
    const peer = await ergo.peer(0);
    await welcome(peer);
    await peer.next(/^CHATHISTORY /);
    peer.say(":ergo.test BATCH +a chathistory #bubble");
    for (const { id, time } of full(0).slice(0, 49))
      peer.say(message(`batch=a;account=g1a;msgid=${id};time=${time}`, "a!u@h", ["#bubble", "x"]));
    peer.say(`@batch=a;account=g1a;msgid=n1;time=${T(49)} :a!u@h NOTICE #bubble :a notice`);
    peer.say(":ergo.test BATCH -a");
    expect(await peer.next(/^CHATHISTORY /)).toBe(`CHATHISTORY AFTER #bubble timestamp=${before(T(49))} 50`);
    await expect.poll(() => said.length).toBe(50);
  });

  it("ends a page once: its end said twice asks the next page once (F573)", async () => {
    const ergo = await fakeErgo();
    start(ergo.port, { lastChecked: (room) => (room === "#bubble" ? T(0) : undefined) });
    const peer = await ergo.peer(0);
    await welcome(peer);
    await peer.next(/^CHATHISTORY /);
    page(peer, "a", full(0));
    peer.say(":ergo.test BATCH -a");
    await settled(peer);
    expect(asked(peer)).toHaveLength(2);
  });
});

describe("the IRC link's refused hides (3j's green pass)", () => {
  it("raises the alert when Ergo refuses a REDACT, and not for another command's FAIL", async () => {
    const ergo = await fakeErgo();
    const { lines } = start(ergo.port);
    const peer = await ergo.peer(0);
    await welcome(peer);
    const alerts = () => lines.filter((line) => line.includes('"event":"alert"'));
    peer.say(":ergo.test FAIL CHATHISTORY INVALID_PARAMS AFTER :Invalid parameters");
    await sync(peer, "other");
    expect(alerts()).toEqual([]);
    peer.say(":ergo.test FAIL REDACT REDACT_FORBIDDEN #bubble m1 :You are not authorized to delete this message");
    await sync(peer, "redact");
    expect(alerts()).toEqual([expect.stringContaining('"error":"redact_refused"')]);
  });

  it("raises no alert for a line its author deleted before the hide: Ergo knows its id no more", async () => {
    const ergo = await fakeErgo();
    const { lines } = start(ergo.port);
    const peer = await ergo.peer(0);
    await welcome(peer);
    peer.say(":ergo.test FAIL REDACT UNKNOWN_MSGID #bubble m1 :This message does not exist or is too old");
    await sync(peer, "gone");
    expect(lines.filter((line) => line.includes('"event":"alert"'))).toEqual([]);
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

describe("the IRC link's account (the max review)", () => {
  const SASL = Buffer.from(`\0gnoworld\0${PASSWORD}`).toString("base64");

  it.each(["904", "902", "905", "906"])(
    "ends its login on %s as a refused account, its password in no log, and tries again later",
    async (code) => {
      const ergo = await fakeErgo();
      const { lines } = start(ergo.port);
      const peer = await ergo.peer(0);
      await peer.next(/^CAP REQ /);
      peer.say(":ergo.test CAP * ACK :message-tags account-tag batch draft/chathistory server-time multi-prefix sasl");
      await peer.next(/^AUTHENTICATE PLAIN$/);
      peer.say("AUTHENTICATE +");
      expect(await peer.next(/^AUTHENTICATE /)).toBe(`AUTHENTICATE ${SASL}`);
      peer.say(`:ergo.test ${code} gnoworld :SASL authentication failed`);
      await ergo.peer(1);
      expect(lines.filter((line) => line.includes('"event":"irc_refused"'))).toEqual([
        expect.stringContaining('"error":"sasl"'),
      ]);
      expect(peer.lines.filter((line) => /^(CAP END|OPER)/.test(line))).toEqual([]);
      expect(lines.join("\n")).not.toContain(PASSWORD);
      expect(lines.join("\n")).not.toContain(SASL);
    },
  );

  it("ends its login when Ergo acknowledges its capabilities without sasl, before any password goes out", async () => {
    const ergo = await fakeErgo();
    const { lines } = start(ergo.port);
    const peer = await ergo.peer(0);
    await peer.next(/^CAP REQ /);
    peer.say(":ergo.test CAP * ACK :message-tags account-tag batch draft/chathistory server-time multi-prefix");
    await ergo.peer(1);
    expect(lines.filter((line) => line.includes('"event":"irc_refused"'))).toEqual([
      expect.stringContaining('"error":"cap"'),
    ]);
    expect(peer.lines.filter((line) => /^(CAP END|AUTHENTICATE|OPER)/.test(line))).toEqual([]);
  });

  it("gets ready as a second session of its account, Ergo saying it is an operator already", async () => {
    const ergo = await fakeErgo();
    const { lines } = start(ergo.port);
    const peer = await ergo.peer(0);
    await register(peer);
    await peer.next(/^OPER /);
    peer.say(":ergo.test 400 gnoworld PRIVMSG :not about OPER");
    await sync(peer);
    expect(peer.lines.filter((line) => line.startsWith("JOIN"))).toEqual([]);
    peer.say(":ergo.test 400 gnoworld OPER :You're already opered-up!");
    expect(await peer.next(/^JOIN /)).toBe("JOIN #bubble,#earth");
    await expect.poll(() => lines.filter((line) => line.includes('"event":"irc_ready"'))).toHaveLength(1);
  });

  it("raises the alert once its nick stays taken: a third refusal in a row, and not again for the fourth", async () => {
    const ergo = await fakeErgo();
    const { lines } = start(ergo.port);
    for (let n = 0; n < 4; n++) {
      const peer = await ergo.peer(n);
      await peer.next(/^NICK /);
      peer.say(":ergo.test 433 * gnoworld :Nickname is already in use");
    }
    await ergo.peer(4);
    expect(lines.filter((line) => line.includes('"event":"alert"'))).toEqual([
      expect.stringContaining('"error":"irc_nick_taken"'),
    ]);
  });

  it("counts its nick's refusals in a row alone: a welcome starts the count again, and the alert comes again", async () => {
    const ergo = await fakeErgo();
    const { lines } = start(ergo.port);
    const taken = async (n: number) => {
      const peer = await ergo.peer(n);
      await peer.next(/^NICK /);
      peer.say(":ergo.test 433 * gnoworld :Nickname is already in use");
    };
    const back = async (n: number) => {
      const peer = await ergo.peer(n);
      await welcome(peer);
      peer.socket.destroy();
    };
    const alerts = () => lines.filter((line) => line.includes('"error":"irc_nick_taken"'));
    for (const n of [0, 1]) await taken(n);
    await back(2);
    for (const n of [3, 4]) await taken(n);
    await ergo.peer(5);
    expect(alerts()).toEqual([]);
    await taken(5);
    await back(6);
    expect(alerts()).toHaveLength(1);
    for (const n of [7, 8, 9]) await taken(n);
    await ergo.peer(10);
    expect(alerts()).toHaveLength(2);
  });
});
