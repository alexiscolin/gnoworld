import { Address } from "@gnoworld/schemas";
import type { IrcMessage } from "@gnoworld/core";
import { describe, expect, it } from "vitest";
import type { Result } from "../api/login.ts";
import { BACKOFF, CAPS, connectErgo, HANDSHAKE_MS, PING_MS, STABLE_MS, type ErgoState, type Socket } from "./ergo.ts";

const ADDRESS = Address.parse("g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5");
const ERGO = "wss://gnoworld.example/ws";
// The capabilities the server's own tests ask of the real Ergo (server/src/testing/ergoKit.ts), word for word.
const KIT_CAPS =
  "message-tags server-time account-tag echo-message batch labeled-response sasl draft/chathistory " +
  "draft/event-playback draft/message-redaction account-notify extended-join multi-prefix draft/metadata-2 standard-replies";
// The SASL PLAIN payload of an address and a ticket: base64 of their UTF-8, NUL before each.
const plain = (ticket: string) => btoa(String.fromCharCode(...new TextEncoder().encode(`\0${ADDRESS}\0${ticket}`)));

// A socket the test drives. Its close event comes when the test delivers it, as a browser's does, later.
class FakeSocket implements Socket {
  sent: string[] = [];
  closed = false;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: (() => void) | null = null;
  readonly url: string;
  throwOnSend = false;
  constructor(url: string) {
    this.url = url;
  }
  send(data: string) {
    if (this.throwOnSend) throw new Error("socket gone");
    this.sent.push(data);
  }
  close() {
    this.closed = true;
  }
  open() {
    this.onopen?.();
  }
  say(data: unknown) {
    this.onmessage?.({ data });
  }
  closeEvent() {
    this.onclose?.();
  }
}

type TicketAnswer = () => Promise<Result<{ ticket: string }>>;
const granted =
  (ticket: string): TicketAnswer =>
  () =>
    Promise.resolve({ ok: true, value: { ticket } });

// One client, its sockets, its states, the lines it handed on, its waits on a clock the test runs.
const setup = (options: { tickets?: TicketAnswer[]; random?: () => number } = {}) => {
  const sockets: FakeSocket[] = [];
  const states: ErgoState[] = [];
  const lines: IrcMessage[] = [];
  const waits: { ms: number; run: () => void; cancelled: boolean }[] = [];
  let mints = 0;
  const client = connectErgo({
    url: ERGO,
    address: ADDRESS,
    ticket: () => {
      mints += 1;
      return (options.tickets?.[mints - 1] ?? granted(`ticket-${String(mints)}`))();
    },
    open: (url) => {
      const socket = new FakeSocket(url);
      sockets.push(socket);
      return socket;
    },
    onState: (state) => states.push(state),
    onLine: (line) => lines.push(line),
    random: options.random ?? (() => 0.5),
    after: (ms, run) => {
      const wait = { ms, run, cancelled: false };
      waits.push(wait);
      return () => {
        wait.cancelled = true;
      };
    },
  });
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
  // The waits still to run, by what they wait for: a reconnect's backoff, or a deadline.
  const pending = () => waits.filter((w) => !w.cancelled);
  // After a failure every other timer is cancelled: what is left is the backoff.
  const backoffs = pending;
  const run = async (wait: { run: () => void; cancelled: boolean } | undefined) => {
    if (wait === undefined || wait.cancelled) throw new Error("no such wait");
    wait.cancelled = true;
    wait.run();
    await settle();
  };
  const last = () => {
    const socket = sockets.at(-1);
    if (socket === undefined) throw new Error("no socket");
    return socket;
  };
  return { client, sockets, states, lines, waits, pending, backoffs, run, settle, last, mints: () => mints };
};
type Setup = ReturnType<typeof setup>;

// The server's half of the handshake, step by step.
const ack = (s: FakeSocket) => {
  s.say(`:ergo CAP * ACK :${KIT_CAPS}`);
};
const plus = (s: FakeSocket) => {
  s.say("AUTHENTICATE +");
};
const saslOk = (s: FakeSocket) => {
  s.say(":ergo 903 * :SASL authentication successful");
};
const motd = (s: FakeSocket) => {
  s.say(`:ergo 376 ${ADDRESS} :End of MOTD`);
};
const welcome = (s: FakeSocket) => {
  s.open();
  ack(s);
  plus(s);
  saslOk(s);
  s.say(`:ergo 001 ${ADDRESS} :Welcome`);
  motd(s);
};
const connected = async (): Promise<Setup & { s: FakeSocket }> => {
  const t = setup();
  await t.settle();
  const s = t.last();
  welcome(s);
  return { ...t, s };
};

describe("connectErgo's handshake", () => {
  it("asks the capabilities the real Ergo is asked, word for word", () => {
    expect(CAPS).toBe(KIT_CAPS);
  });

  it("asks a ticket, opens the socket, and logs in by SASL: every line it sends, in order", async () => {
    const t = setup();
    await t.settle();
    expect(t.sockets.map((s) => s.url)).toEqual([ERGO]);
    const s = t.last();
    s.open();
    s.say(":ergo CAP * LS * :message-tags server-time");
    s.say(":ergo CAP * LS :sasl draft/chathistory");
    expect(s.sent).toEqual(["CAP LS 302", `CAP REQ :${CAPS}`]);
    ack(s);
    plus(s);
    saslOk(s);
    expect(t.states).toEqual(["connecting"]);
    motd(s);
    expect(s.sent).toEqual([
      "CAP LS 302",
      `CAP REQ :${CAPS}`,
      "AUTHENTICATE PLAIN",
      `AUTHENTICATE ${plain("ticket-1")}`,
      "CAP END",
      `NICK ${ADDRESS}`,
      `USER u 0 * :${ADDRESS}`,
    ]);
    expect(t.states).toEqual(["connecting", "connected"]);
    expect(t.mints()).toBe(1);
  });

  it("is connected on a server with no MOTD too (422), once only", async () => {
    const t = setup();
    await t.settle();
    const s = t.last();
    s.open();
    ack(s);
    plus(s);
    saslOk(s);
    s.say(`:ergo 422 ${ADDRESS} :MOTD File is missing`);
    motd(s);
    expect(t.states).toEqual(["connecting", "connected"]);
  });

  // A server's line out of its step moves nothing: the ticket goes out once, after Ergo asks for it.
  it.each([
    ["the MOTD's end before any SASL", motd],
    ["a 903 before AUTHENTICATE +", saslOk],
    ["AUTHENTICATE + before the ACK", plus],
    [
      "a welcome (001) before any SASL",
      (s: FakeSocket) => {
        s.say(`:ergo 001 ${ADDRESS} :Welcome`);
      },
    ],
  ])("ignores %s", async (_, line) => {
    const t = setup();
    await t.settle();
    const s = t.last();
    s.open();
    line(s);
    expect(s.sent).toEqual(["CAP LS 302", `CAP REQ :${CAPS}`]);
    expect(t.states).toEqual(["connecting"]);
  });

  it("sends the ticket once, though Ergo asks twice, and registers once after two 903s", async () => {
    const t = setup();
    await t.settle();
    const s = t.last();
    s.open();
    ack(s);
    plus(s);
    plus(s);
    saslOk(s);
    saslOk(s);
    expect(s.sent.filter((line) => line.startsWith("AUTHENTICATE ") && line !== "AUTHENTICATE PLAIN")).toHaveLength(1);
    expect(s.sent.filter((line) => line === "CAP END")).toHaveLength(1);
  });

  it("splits a SASL payload into chunks of 400, then a + when the last is exactly 400 (IRCv3's SASL)", async () => {
    const long = "t".repeat(400 - 44 + 300);
    const t = setup({ tickets: [granted(long)] });
    await t.settle();
    const s = t.last();
    s.open();
    ack(s);
    plus(s);
    const chunks = s.sent
      .filter((line) => line.startsWith("AUTHENTICATE ") && line !== "AUTHENTICATE PLAIN")
      .map((line) => line.slice(13));
    expect(chunks.join("")).toBe(plain(long));
    expect(chunks.slice(0, -1).every((chunk) => chunk.length === 400)).toBe(true);
    const exact = setup({ tickets: [granted("t".repeat(300 - 42 - 2))] });
    await exact.settle();
    const e = exact.last();
    e.open();
    ack(e);
    plus(e);
    expect(plain("t".repeat(300 - 42 - 2))).toHaveLength(400);
    expect(e.sent.slice(-2)).toEqual([`AUTHENTICATE ${plain("t".repeat(256))}`, "AUTHENTICATE +"]);
  });

  it("encodes a ticket's characters past Latin-1 as UTF-8, never throwing", async () => {
    const t = setup({ tickets: [granted("é-ticket-🦦")] });
    await t.settle();
    const s = t.last();
    s.open();
    ack(s);
    plus(s);
    expect(s.sent.at(-1)).toBe(`AUTHENTICATE ${plain("é-ticket-🦦")}`);
  });

  // A refusal at any step closes the socket and waits, once.
  it.each([
    ["Ergo refuses the ticket (904)", ":ergo 904 * :SASL authentication failed"],
    ["Ergo's SASL message is too long (905)", ":ergo 905 * :SASL message too long"],
    ["Ergo aborts the SASL (906)", ":ergo 906 * :SASL authentication aborted"],
    ["the account is already logged in by SASL (907)", ":ergo 907 * :You have already authenticated"],
    ["Ergo's account is locked (902)", ":ergo 902 * :You must use a nick assigned to you"],
    ["the server sends ERROR", "ERROR :Closing Link"],
  ])("waits once when %s", async (_, line) => {
    const t = setup();
    await t.settle();
    const s = t.last();
    s.open();
    ack(s);
    plus(s);
    s.say(line);
    expect(s.closed).toBe(true);
    s.closeEvent();
    s.closeEvent();
    expect(t.states.at(-1)).toBe("waiting");
    expect(t.backoffs()).toHaveLength(1);
  });

  it("waits once when Ergo grants no SASL (its NAK echoes the whole list)", async () => {
    const t = setup();
    await t.settle();
    const s = t.last();
    s.open();
    s.say(`:ergo CAP * NAK :${CAPS}`);
    expect(s.closed).toBe(true);
    expect(t.backoffs()).toHaveLength(1);
  });

  it("waits once when Ergo acknowledges every capability but sasl", async () => {
    const t = setup();
    await t.settle();
    const s = t.last();
    s.open();
    s.say(":ergo CAP * ACK :message-tags server-time");
    expect(s.closed).toBe(true);
    expect(t.backoffs()).toHaveLength(1);
  });

  it("waits once when the nick, its address, is taken by another client of the account (433)", async () => {
    const t = setup();
    await t.settle();
    const s = t.last();
    s.open();
    ack(s);
    plus(s);
    saslOk(s);
    s.say(`:ergo 433 * ${ADDRESS} :Nickname is already in use`);
    expect(s.closed).toBe(true);
    expect(t.states.at(-1)).toBe("waiting");
  });

  // Each step that stalls past the handshake's deadline closes the socket and waits.
  it.each([
    ["the socket never opens", () => undefined],
    [
      "Ergo never answers the capabilities",
      (s: FakeSocket) => {
        s.open();
      },
    ],
    [
      "Ergo never asks the ticket",
      (s: FakeSocket) => {
        s.open();
        ack(s);
      },
    ],
    [
      "Ergo never answers the ticket",
      (s: FakeSocket) => {
        s.open();
        ack(s);
        plus(s);
      },
    ],
    [
      "Ergo never ends the registration",
      (s: FakeSocket) => {
        s.open();
        ack(s);
        plus(s);
        saslOk(s);
      },
    ],
  ])("gives up when %s, at its deadline", async (_, steps) => {
    const t = setup();
    await t.settle();
    const s = t.last();
    steps(s);
    const deadline = t.pending().find((w) => w.ms === HANDSHAKE_MS);
    expect(deadline).toBeDefined();
    await t.run(deadline);
    expect(s.closed).toBe(true);
    expect(t.states.at(-1)).toBe("waiting");
    expect(t.backoffs()).toHaveLength(1);
  });

  it("drops the handshake's deadline once connected", async () => {
    const t = await connected();
    expect(t.pending().filter((w) => w.ms === HANDSHAKE_MS)).toHaveLength(0);
  });
});

describe("connectErgo, connected", () => {
  it("answers PING at any step, a bare one and one with a token", async () => {
    const t = setup();
    await t.settle();
    const s = t.last();
    s.open();
    s.say("PING :early");
    expect(s.sent.at(-1)).toBe("PONG :early");
    welcome(s);
    s.say("PING");
    expect(s.sent.at(-1)).toBe("PONG");
    s.say("PING token");
    expect(s.sent.at(-1)).toBe("PONG :token");
    expect(t.lines.map((l) => l.command)).not.toContain("PING");
  });

  it("hands on each line after the registration, parsed whole, and none before it", async () => {
    const t = setup();
    await t.settle();
    const s = t.last();
    s.open();
    s.say(":ergo NOTICE * :*** Looking up your hostname");
    welcome(s);
    s.say("@time=2026-10-25T10:00:00.000Z :a!b@h PRIVMSG #bubble :hello world");
    expect(t.lines).toHaveLength(1);
    expect(t.lines[0]).toEqual({
      tags: new Map([["time", "2026-10-25T10:00:00.000Z"]]),
      source: "a!b@h",
      command: "PRIVMSG",
      params: ["#bubble", "hello world"],
    });
  });

  it.each([
    ["an empty line", ""],
    ["no command", ":a!b@h"],
    ["a line holding CRLF, which a message never carries", ":a!b@h PRIVMSG #b :one\r\nQUIT"],
    ["a lone newline inside", ":a!b@h PRIVMSG #b :one\nQUIT"],
    ["a body past 510 bytes", `:a!b@h PRIVMSG #b :${"x".repeat(600)}`],
    ["tags past 8191 bytes", `@a=${"x".repeat(9000)} PRIVMSG #b :x`],
    ["a NUL", ":a!b@h PRIVMSG #b :a\0b"],
    ["a number", 7],
    ["null", null],
    ["a binary frame", new ArrayBuffer(4)],
  ])("drops %s and stays connected", async (_, data) => {
    const t = await connected();
    t.s.say(data);
    t.s.say(":a!b@h PRIVMSG #bubble :still here");
    expect(t.lines.map((l) => l.params.at(-1))).toEqual(["still here"]);
    expect(t.states.at(-1)).toBe("connected");
  });

  it("hands on a flood of 10,000 lines in order, a PING among them answered", async () => {
    const t = await connected();
    for (let n = 0; n < 10_000; n += 1) {
      if (n === 5_000) t.s.say("PING :mid");
      t.s.say(`:a!b@h PRIVMSG #bubble :${String(n)}`);
    }
    expect(t.lines.map((l) => l.params.at(-1))).toEqual(Array.from({ length: 10_000 }, (_, n) => String(n)));
    expect(t.s.sent).toContain("PONG :mid");
  });

  it("sends one line, once connected, and refuses what is not one line", async () => {
    const t = setup();
    await t.settle();
    const s = t.last();
    s.open();
    expect(t.client.send("JOIN #bubble")).toBe(false);
    welcome(s);
    expect(t.client.send("JOIN #bubble")).toBe(true);
    expect(s.sent.at(-1)).toBe("JOIN #bubble");
    for (const line of [
      "",
      "PRIVMSG #b :a\r\nQUIT",
      "PRIVMSG #b :a\nQUIT",
      "PRIVMSG #b :a\rQUIT",
      "PRIVMSG #b :a\0",
      `PRIVMSG #b :${"é".repeat(256)}`,
    ]) {
      expect(t.client.send(line)).toBe(false);
    }
    expect(t.client.send(`PRIVMSG #b :${"x".repeat(510 - 13)}`)).toBe(true);
    expect(s.sent.at(-1)).toBe(`PRIVMSG #b :${"x".repeat(497)}`);
  });

  it("refuses to send while it waits, and sends nothing it refused once back", async () => {
    const t = await connected();
    t.s.closeEvent();
    expect(t.client.send("PRIVMSG #bubble :while away")).toBe(false);
    await t.run(t.backoffs()[0]);
    welcome(t.last());
    expect(t.last().sent).not.toContain("PRIVMSG #bubble :while away");
  });

  it("says a line was not sent when the socket throws", async () => {
    const t = await connected();
    t.s.throwOnSend = true;
    expect(t.client.send("JOIN #bubble")).toBe(false);
  });

  it("pings a silent server after its time, and gives up when it stays silent", async () => {
    const t = await connected();
    const quiet = t.pending().find((w) => w.ms === PING_MS);
    await t.run(quiet);
    expect(t.s.sent.at(-1)).toMatch(/^PING :/);
    expect(t.s.closed).toBe(false);
    await t.run(t.pending().find((w) => w.ms === PING_MS));
    expect(t.s.closed).toBe(true);
    expect(t.states.at(-1)).toBe("waiting");
  });

  it("starts its silence over on every line", async () => {
    const t = await connected();
    const first = t.pending().find((w) => w.ms === PING_MS);
    t.s.say(":a!b@h PRIVMSG #bubble :alive");
    expect(first?.cancelled).toBe(true);
    expect(t.pending().filter((w) => w.ms === PING_MS)).toHaveLength(1);
  });
});

describe("connectErgo's reconnects", () => {
  it("pins its backoff: one second at first, a minute at most", () => {
    expect(BACKOFF).toEqual({ firstMs: 1000, ceilingMs: 60_000 });
    expect(HANDSHAKE_MS).toBe(20_000);
    expect(PING_MS).toBe(30_000);
    expect(STABLE_MS).toBe(60_000);
  });

  it("waits a random share of its cap after a drop, then reconnects with a fresh ticket, asked once", async () => {
    const t = await connected();
    t.s.closeEvent();
    t.s.closeEvent();
    expect(t.states).toEqual(["connecting", "connected", "waiting"]);
    expect(t.backoffs().map((w) => w.ms)).toEqual([500]);
    await t.run(t.backoffs()[0]);
    expect(t.sockets).toHaveLength(2);
    expect(t.mints()).toBe(2);
    const again = t.last();
    again.open();
    ack(again);
    plus(again);
    expect(again.sent.at(-1)).toBe(`AUTHENTICATE ${plain("ticket-2")}`);
    expect(t.states).toEqual(["connecting", "connected", "waiting", "connecting"]);
  });

  it.each([
    [0, 0],
    [0.999, 999],
  ])("waits random × cap: %f of the first second is %i ms", async (random, ms) => {
    const t = setup({ random: () => random });
    await t.settle();
    t.last().closeEvent();
    expect(t.backoffs().map((w) => Math.round(w.ms))).toEqual([ms]);
  });

  // random() is 0.5: each wait is half of a cap that doubles, whatever failed.
  const failures: [string, (s: FakeSocket) => void][] = [
    [
      "a drop",
      (s) => {
        s.closeEvent();
      },
    ],
    [
      "a 904",
      (s) => {
        s.open();
        ack(s);
        plus(s);
        s.say(":ergo 904 * :failed");
      },
    ],
    [
      "a NAK",
      (s) => {
        s.open();
        s.say(`:ergo CAP * NAK :${CAPS}`);
      },
    ],
  ];
  it.each(failures)("doubles its cap on each %s, up to its ceiling", async (_, fail) => {
    const t = setup();
    await t.settle();
    const caps: number[] = [];
    for (let n = 0; n < 9; n += 1) {
      fail(t.last());
      const wait = t.backoffs()[0];
      caps.push((wait?.ms ?? 0) * 2);
      await t.run(wait);
    }
    expect(caps).toEqual([1000, 2000, 4000, 8000, 16_000, 32_000, 60_000, 60_000, 60_000]);
  });

  it("starts its cap over only after a minute connected, not on a drop just after the welcome", async () => {
    const t = setup();
    await t.settle();
    const caps: number[] = [];
    for (let n = 0; n < 3; n += 1) {
      welcome(t.last());
      t.last().closeEvent();
      const wait = t.backoffs()[0];
      caps.push((wait?.ms ?? 0) * 2);
      await t.run(wait);
    }
    expect(caps).toEqual([1000, 2000, 4000]);
    welcome(t.last());
    await t.run(t.pending().find((w) => w.ms === STABLE_MS));
    t.last().closeEvent();
    expect(t.backoffs().map((w) => w.ms)).toEqual([500]);
  });

  it.each([
    "refused",
    "forbidden",
    "not_found",
    "too_many",
    "internal",
    "not_ready",
    "unavailable",
    "malformed",
    "network",
    "too_large",
    "unsupported",
  ] as const)("waits, its cap doubling, then asks again when the ticket is refused for %s", async (reason) => {
    const t = setup({
      tickets: [() => Promise.resolve({ ok: false, reason }), () => Promise.resolve({ ok: false, reason })],
    });
    await t.settle();
    expect(t.sockets).toHaveLength(0);
    expect(t.backoffs().map((w) => w.ms)).toEqual([500]);
    await t.run(t.backoffs()[0]);
    expect(t.backoffs().map((w) => w.ms)).toEqual([1000]);
    await t.run(t.backoffs()[0]);
    expect(t.sockets).toHaveLength(1);
  });

  it.each([
    ["rejects", () => Promise.reject(new Error("broken"))],
    [
      "throws",
      () => {
        throw new Error("broken");
      },
    ],
    ["grants an empty ticket", () => Promise.resolve({ ok: true, value: { ticket: "" } })],
  ] as [string, TicketAnswer][])("waits, then asks again, when the ticket's call %s", async (_, answer) => {
    const t = setup({ tickets: [answer] });
    await t.settle();
    expect(t.sockets).toHaveLength(0);
    expect(t.states.at(-1)).toBe("waiting");
    await t.run(t.backoffs()[0]);
    expect(t.sockets).toHaveLength(1);
  });

  it("stops, logged out, when the server knows no session for the ticket, first or later", async () => {
    const t = setup({ tickets: [() => Promise.resolve({ ok: false, reason: "unauthenticated" })] });
    await t.settle();
    expect(t.sockets).toHaveLength(0);
    expect(t.states).toEqual(["connecting", "logged-out"]);
    expect(t.pending()).toHaveLength(0);
    const u = setup({ tickets: [granted("first"), () => Promise.resolve({ ok: false, reason: "unauthenticated" })] });
    await u.settle();
    welcome(u.last());
    u.last().closeEvent();
    await u.run(u.backoffs()[0]);
    expect(u.states).toEqual(["connecting", "connected", "waiting", "connecting", "logged-out"]);
    expect(u.pending()).toHaveLength(0);
  });
});

describe("connectErgo's stop", () => {
  it("closes the socket of a connected client, leaves no wait, and sends nothing more", async () => {
    const t = await connected();
    t.client.stop();
    t.s.closeEvent();
    expect(t.s.closed).toBe(true);
    expect(t.states.at(-1)).toBe("stopped");
    expect(t.pending()).toHaveLength(0);
    expect(t.client.send("JOIN #x")).toBe(false);
  });

  it("stops while it waits: the wait cancelled, nothing reopened if it runs anyway", async () => {
    const t = await connected();
    t.s.closeEvent();
    expect(t.backoffs()).toHaveLength(1);
    const leftover = t.waits.slice();
    t.client.stop();
    expect(t.pending()).toHaveLength(0);
    for (const wait of leftover) wait.run();
    await t.settle();
    expect(t.sockets).toHaveLength(1);
    expect(t.states.at(-1)).toBe("stopped");
  });

  it("stops while it asks its ticket: a late ticket opens nothing", async () => {
    let release: (value: Result<{ ticket: string }>) => void = () => undefined;
    const t = setup({ tickets: [() => new Promise((resolve) => (release = resolve))] });
    t.client.stop();
    release({ ok: true, value: { ticket: "late" } });
    await t.settle();
    expect(t.sockets).toHaveLength(0);
    expect(t.states).toEqual(["connecting", "stopped"]);
  });

  it.each([
    ["before the socket opens", () => undefined],
    [
      "in the handshake",
      (s: FakeSocket) => {
        s.open();
        ack(s);
      },
    ],
  ])("stops %s: closed, nothing sent after, no state after stopped", async (_, steps) => {
    const t = setup();
    await t.settle();
    const s = t.last();
    steps(s);
    const sent = s.sent.length;
    t.client.stop();
    t.client.stop();
    plus(s);
    s.closeEvent();
    expect(s.closed).toBe(true);
    expect(s.sent).toHaveLength(sent);
    expect(t.states.at(-1)).toBe("stopped");
    expect(t.states.filter((state) => state === "stopped")).toHaveLength(1);
    expect(t.pending()).toHaveLength(0);
  });
});
