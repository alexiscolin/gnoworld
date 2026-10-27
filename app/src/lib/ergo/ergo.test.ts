import { Address } from "@gnoworld/schemas";
import type { IrcMessage } from "@gnoworld/core";
import { describe, expect, it, vi } from "vitest";
import type { Result } from "../api/login.ts";
import {
  BACKOFF,
  BASIC_CAPS,
  CAPS,
  connectErgo,
  drawGuestNick,
  HANDSHAKE_MS,
  PING_MS,
  STABLE_MS,
  type ErgoState,
  type Socket,
} from "./ergo.ts";

const ADDRESS = Address.parse("g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5");
const ERGO = "wss://gnoworld.example/ws";
// The capabilities the server's own tests ask of the real Ergo (server/src/testing/ergoKit.ts), word for word.
const KIT_CAPS =
  "message-tags server-time account-tag echo-message batch labeled-response sasl draft/chathistory " +
  "draft/event-playback draft/message-redaction account-notify extended-join multi-prefix draft/metadata-2 standard-replies " +
  "draft/multiline";
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
interface Options {
  tickets?: TicketAnswer[];
  random?: () => number;
  guests?: (string | Error)[];
  refusedOpens?: number;
}
const setup = (options: Options = {}) => {
  const sockets: FakeSocket[] = [];
  const states: ErgoState[] = [];
  const lines: IrcMessage[] = [];
  const waits: { ms: number; run: () => void; cancelled: boolean }[] = [];
  let mints = 0;
  let opensRefused = 0;
  const client = connectErgo({
    url: ERGO,
    // A guest draws its nicks from the test's list, an Error thrown; an account asks a ticket for each connection.
    who:
      options.guests === undefined
        ? {
            account: ADDRESS,
            ticket: () => {
              mints += 1;
              return (options.tickets?.[mints - 1] ?? granted(`ticket-${String(mints)}`))();
            },
          }
        : {
            guest: () => {
              mints += 1;
              const nick = options.guests?.[mints - 1] ?? `guest-${String(mints)}`;
              if (nick instanceof Error) throw nick;
              return nick;
            },
          },
    // The first refusedOpens sockets throw, as the browser's constructor does on a URL or a CSP it refuses.
    open: (url) => {
      if (sockets.length + opensRefused < (options.refusedOpens ?? 0)) {
        opensRefused += 1;
        throw new DOMException("refused", "SecurityError");
      }
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
    s.say(`:ergo CAP * NAK :${BASIC_CAPS}`);
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

  // Each step moves on its own line alone: a line of another step, or none, sends nothing (pre-merge 4b).
  it("sends its ticket on Ergo's AUTHENTICATE + alone, never on another line after the ACK", async () => {
    const t = setup();
    await t.settle();
    const s = t.last();
    s.open();
    ack(s);
    const before = [...s.sent];
    s.say(":ergo NOTICE * :x");
    s.say("AUTHENTICATE abc");
    s.say(":ergo 900 + :x");
    expect(s.sent).toEqual(before);
  });

  it("registers on Ergo's 903 alone, never on another line after the ticket", async () => {
    const t = setup();
    await t.settle();
    const s = t.last();
    s.open();
    ack(s);
    plus(s);
    const before = [...s.sent];
    s.say(":ergo NOTICE * :x");
    s.say(":ergo 900 x :ok");
    expect(s.sent).toEqual(before);
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

  it("waits once when Ergo finds its nick erroneous (432), not at the deadline", async () => {
    const t = setup();
    await t.settle();
    const s = t.last();
    s.open();
    ack(s);
    plus(s);
    saslOk(s);
    s.say(`:ergo 432 * ${ADDRESS} :Erroneous nickname`);
    expect(s.closed).toBe(true);
    expect(t.states.at(-1)).toBe("waiting");
    expect(t.backoffs()).toHaveLength(1);
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

  it("waits when the browser refuses to open the socket, and opens one on its next try", async () => {
    const t = setup({ refusedOpens: 1 });
    await t.settle();
    expect(t.sockets).toHaveLength(0);
    expect(t.states).toEqual(["connecting", "waiting"]);
    expect(t.backoffs()).toHaveLength(1);
    await t.run(t.backoffs()[0]);
    expect(t.sockets).toHaveLength(1);
  });

  it("names an account by the nick Ergo welcomed it with, though it sent its address", async () => {
    const t = setup();
    await t.settle();
    const s = t.last();
    s.open();
    ack(s);
    plus(s);
    saslOk(s);
    s.say(":ergo 001 G1JG8MTUTU9KHHFWC4NXMUHCPFTF0PAJDHFVSQF5 :Welcome");
    motd(s);
    expect(t.client.nick()).toBe("G1JG8MTUTU9KHHFWC4NXMUHCPFTF0PAJDHFVSQF5");
  });

  it("names the nick Ergo welcomed it with (001) once connected, and none before or after", async () => {
    const t = setup();
    await t.settle();
    const s = t.last();
    expect(t.client.nick()).toBeUndefined();
    s.open();
    ack(s);
    plus(s);
    saslOk(s);
    s.say(`:ergo 001 ${ADDRESS} :Welcome`);
    expect(t.client.nick()).toBeUndefined();
    motd(s);
    expect(t.client.nick()).toBe(ADDRESS);
    s.closeEvent();
    expect(t.client.nick()).toBeUndefined();
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

  // A refusal ends a handshake alone: once connected, Ergo's 433 answers a NICK, its 904 a later SASL.
  it.each([
    ["433", `:ergo 433 ${ADDRESS} other :Nickname is already in use`],
    ["432", `:ergo 432 ${ADDRESS} "bad :Erroneous nickname`],
    ["904", `:ergo 904 ${ADDRESS} :SASL authentication failed`],
  ])("hands on a %s once connected, as any line, and stays connected", async (command, line) => {
    const t = await connected();
    t.s.say(line);
    expect(t.lines.map((l) => l.command)).toEqual([command]);
    expect(t.s.closed).toBe(false);
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
        s.say(`:ergo CAP * NAK :${BASIC_CAPS}`);
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

// A visitor not logged in reads the public rooms as a guest (Alexis, 2026-10-25): no ticket, no SASL, a nick of
// its own drawn at random, another drawn when Ergo says one is taken.
describe("connectErgo as a guest", () => {
  const guest = async (nicks?: (string | Error)[]) => {
    const t = setup({ guests: nicks ?? ["guest-ab12cd"] });
    await t.settle();
    return { ...t, s: t.last() };
  };

  it("asks no ticket, and registers with its nick, no SASL: every line it sends, in order", async () => {
    const t = await guest();
    t.s.open();
    ack(t.s);
    expect(t.s.sent).toEqual([
      "CAP LS 302",
      `CAP REQ :${CAPS}`,
      "CAP END",
      "NICK guest-ab12cd",
      "USER u 0 * :guest-ab12cd",
    ]);
    t.s.say(":ergo 001 guest-ab12cd :Welcome");
    motd(t.s);
    expect(t.states).toEqual(["connecting", "connected"]);
    expect(t.s.sent.some((line) => line.startsWith("AUTHENTICATE"))).toBe(false);
  });

  const nicks = (s: FakeSocket) => s.sent.filter((line) => line.startsWith("NICK "));
  const taken = (s: FakeSocket) => {
    s.say(":ergo 433 * guest :Nickname is already in use");
  };

  it("draws another nick when Ergo says one is taken (433): one NICK more, nothing else, in the same deadline", async () => {
    const t = await guest(["guest-one", "guest-two"]);
    t.s.open();
    ack(t.s);
    const deadline = t.pending().filter((w) => w.ms === HANDSHAKE_MS);
    taken(t.s);
    expect(t.s.sent).toEqual([
      "CAP LS 302",
      `CAP REQ :${CAPS}`,
      "CAP END",
      "NICK guest-one",
      "USER u 0 * :guest-one",
      "NICK guest-two",
    ]);
    const after = t.pending().filter((w) => w.ms === HANDSHAKE_MS);
    expect(deadline).toHaveLength(1);
    expect(after).toHaveLength(1);
    expect(after[0]).toBe(deadline[0]);
    expect(t.states).toEqual(["connecting"]);
    motd(t.s);
    expect(t.states).toEqual(["connecting", "connected"]);
  });

  it("keeps its handshake through seven taken nicks, and gives up on the eighth, drawing no ninth", async () => {
    const t = await guest(Array.from({ length: 9 }, (_, n) => `guest-${String(n)}`));
    t.s.open();
    ack(t.s);
    for (let n = 0; n < 7; n += 1) taken(t.s);
    expect(t.s.closed).toBe(false);
    expect(t.states).toEqual(["connecting"]);
    expect(nicks(t.s)).toHaveLength(8);
    taken(t.s);
    expect(t.s.closed).toBe(true);
    expect(nicks(t.s)).toHaveLength(8);
    expect(t.states.at(-1)).toBe("waiting");
  });

  it("counts its taken nicks per connection: after a drop, seven more keep the handshake", async () => {
    const t = await guest(Array.from({ length: 20 }, (_, n) => `guest-${String(n)}`));
    t.s.open();
    ack(t.s);
    for (let n = 0; n < 4; n += 1) taken(t.s);
    t.s.closeEvent();
    await t.run(t.backoffs()[0]);
    const again = t.last();
    again.open();
    ack(again);
    for (let n = 0; n < 7; n += 1) taken(again);
    expect(again.closed).toBe(false);
    expect(t.states.at(-1)).toBe("connecting");
  });

  it.each([
    ["Ergo's ERROR", "ERROR :Closing Link: throttled"],
    ["SASL's 905", ":ergo 905 * :Message too long"],
    ["SASL's 906", ":ergo 906 * :Aborted"],
    ["an erroneous nick (432)", ":ergo 432 * guest-one :Erroneous nickname"],
  ])("fails at once on %s while it registers, drawing no other nick", async (_, line) => {
    const t = await guest(["guest-one", "guest-two"]);
    t.s.open();
    ack(t.s);
    t.s.say(line);
    expect(t.s.closed).toBe(true);
    expect(t.states.at(-1)).toBe("waiting");
    expect(nicks(t.s)).toEqual(["NICK guest-one"]);
  });

  it("fails on a 433 before it registers, having sent no nick", async () => {
    const t = await guest(["guest-one", "guest-two"]);
    t.s.open();
    taken(t.s);
    expect(t.s.closed).toBe(true);
    expect(t.s.sent).toEqual(["CAP LS 302", `CAP REQ :${CAPS}`]);
  });

  it("hands on a 433 once connected, as any line, drawing no nick", async () => {
    const t = await guest(["guest-one", "guest-two"]);
    welcomeGuest(t.s, "guest-one");
    taken(t.s);
    expect(t.lines.map((l) => l.command)).toEqual(["433"]);
    expect(nicks(t.s)).toEqual(["NICK guest-one"]);
    expect(t.states.at(-1)).toBe("connected");
  });

  // A nick is one word of letters, digits and hyphens, a letter first, 32 at most (Ergo's NICKLEN for a guest,
  // server/src/testing/ergo.test.ts:314): anything else would break the line, or be refused.
  it.each(["", "a b", "x\r\nJOIN #r", "x\0y", "guest-é", "g".repeat(33), "-guest", "1guest", ADDRESS])(
    "opens no socket for a nick it cannot send (%j), and draws again on its next try",
    async (bad) => {
      const t = setup({ guests: [bad, "guest-ok"] });
      await t.settle();
      expect(t.sockets).toHaveLength(0);
      expect(t.states).toEqual(["connecting", "waiting"]);
      await t.run(t.backoffs()[0]);
      t.last().open();
      ack(t.last());
      expect(nicks(t.last())).toEqual(["NICK guest-ok"]);
    },
  );

  it("takes a nick of 32 characters", async () => {
    const t = await guest(["g".repeat(32)]);
    t.s.open();
    ack(t.s);
    expect(nicks(t.s)).toEqual([`NICK ${"g".repeat(32)}`]);
  });

  it.each([
    ["a nick it cannot send", "x\r\nJOIN #r"],
    ["a throw", new Error("no randomness")],
  ])("fails, sending nothing more, when the nick drawn after a 433 is %s", async (_, bad) => {
    const t = await guest(["guest-one", bad, "guest-three"]);
    t.s.open();
    ack(t.s);
    expect(() => {
      taken(t.s);
    }).not.toThrow();
    expect(t.s.closed).toBe(true);
    expect(t.states.at(-1)).toBe("waiting");
    expect(nicks(t.s)).toEqual(["NICK guest-one"]);
  });

  it("gives up when its registration stalls, at its one deadline", async () => {
    const t = await guest();
    t.s.open();
    ack(t.s);
    await t.run(t.pending().find((w) => w.ms === HANDSHAKE_MS));
    expect(t.s.closed).toBe(true);
    expect(t.states.at(-1)).toBe("waiting");
  });

  it("sends nothing once stopped, though a 433 comes late", async () => {
    const t = await guest(["guest-one", "guest-two"]);
    t.s.open();
    ack(t.s);
    t.client.stop();
    taken(t.s);
    expect(nicks(t.s)).toEqual(["NICK guest-one"]);
    expect(t.states.at(-1)).toBe("stopped");
  });

  it("names itself by the nick Ergo took, the one drawn after a 433", async () => {
    const t = await guest(["guest-one", "guest-two"]);
    t.s.open();
    ack(t.s);
    taken(t.s);
    t.s.say(":ergo 001 guest-two :Welcome");
    motd(t.s);
    expect(t.client.nick()).toBe("guest-two");
  });

  it.each([
    ["names none", ":ergo 001"],
    ["names an empty nick", ":ergo 001 :"],
    ["names *", ":ergo 001 * :Welcome"],
  ])("names itself by the nick it last sent when Ergo's welcome %s", async (_, welcome) => {
    const t = await guest(["guest-one", "guest-two"]);
    t.s.open();
    ack(t.s);
    taken(t.s);
    t.s.say(welcome);
    motd(t.s);
    expect(t.client.nick()).toBe("guest-two");
  });

  it("names itself by the nick Ergo's welcome gives, though it sent another", async () => {
    const t = await guest(["guest-one"]);
    t.s.open();
    ack(t.s);
    t.s.say(":ergo 001 other-name :Welcome");
    motd(t.s);
    expect(t.client.nick()).toBe("other-name");
  });

  it("takes a reconnect's welcome alone: one that names none gives the nick sent, not the last welcome's", async () => {
    const t = await guest(["guest-one", "guest-two"]);
    t.s.open();
    ack(t.s);
    t.s.say(":ergo 001 other-name :Welcome");
    motd(t.s);
    t.s.closeEvent();
    await t.run(t.backoffs()[0]);
    const again = t.last();
    again.open();
    ack(again);
    again.say(":ergo 001");
    motd(again);
    expect(t.client.nick()).toBe("guest-two");
  });

  it("changes its nick on no 001 once connected: the line is handed on", async () => {
    const t = await guest(["guest-one"]);
    welcomeGuest(t.s, "guest-one");
    t.s.say(":ergo 001 someone-else :Welcome");
    expect(t.client.nick()).toBe("guest-one");
    expect(t.lines.map((l) => l.command)).toEqual(["001"]);
  });

  it.each([
    [
      "stopped",
      async (t: Setup & { s: FakeSocket }) => {
        t.client.stop();
        await t.settle();
      },
    ],
    [
      "given an ERROR",
      async (t: Setup & { s: FakeSocket }) => {
        t.s.say("ERROR :Closing Link");
        await t.settle();
      },
    ],
    [
      "silent past its ping",
      async (t: Setup & { s: FakeSocket }) => {
        await t.run(t.pending().find((w) => w.ms === PING_MS));
        await t.run(t.pending().find((w) => w.ms === PING_MS));
      },
    ],
  ])("names no nick once %s", async (_, end) => {
    const t = await guest(["guest-one"]);
    welcomeGuest(t.s, "guest-one");
    expect(t.client.nick()).toBe("guest-one");
    await end(t);
    expect(t.client.nick()).toBeUndefined();
  });

  it("waits on Ergo's ERROR once connected", async () => {
    const t = await guest();
    welcomeGuest(t.s, "guest-ab12cd");
    t.s.say("ERROR :Closing Link");
    expect(t.s.closed).toBe(true);
    expect(t.states.at(-1)).toBe("waiting");
  });

  it("is never logged out: a drop waits and comes back as a guest, with a fresh nick", async () => {
    const t = await guest(["guest-one", "guest-two"]);
    welcomeGuest(t.s, "guest-one");
    t.s.closeEvent();
    expect(t.states.at(-1)).toBe("waiting");
    await t.run(t.backoffs()[0]);
    const again = t.last();
    again.open();
    ack(again);
    expect(again.sent).toContain("NICK guest-two");
  });

  it("takes an ACK without sasl, which a guest needs not", async () => {
    const t = await guest();
    t.s.open();
    t.s.say(":ergo CAP * ACK :message-tags server-time batch draft/chathistory");
    expect(t.s.sent.at(-1)).toBe("USER u 0 * :guest-ab12cd");
  });

  it("still fails on a NAK: without the capabilities, no history and no tags", async () => {
    const t = await guest();
    t.s.open();
    t.s.say(`:ergo CAP * NAK :${BASIC_CAPS}`);
    expect(t.s.closed).toBe(true);
  });

  it.each(["904", "902", "907"])("fails on SASL's %s, which a guest never asked", async (code) => {
    const t = await guest();
    t.s.open();
    ack(t.s);
    t.s.say(`:ergo ${code} * :no`);
    expect(t.s.closed).toBe(true);
  });
});

const welcomeGuest = (s: FakeSocket, nick: string) => {
  s.open();
  ack(s);
  s.say(`:ergo 001 ${nick} :Welcome`);
  motd(s);
};

describe("drawGuestNick", () => {
  it("draws guest- and six letters or digits", () => {
    for (let n = 0; n < 200; n += 1) expect(drawGuestNick()).toMatch(/^guest-[a-z0-9]{6}$/);
  });

  // 252 is 7 times 36: a byte past 251 would make a to d likelier, so it is drawn again.
  it("draws each from the browser's randomness alone, a byte to a letter or digit, one past 251 drawn again", () => {
    const bytes = [252, 255, 0, 25, 26, 35, 36, 251];
    vi.stubGlobal("crypto", {
      getRandomValues: (array: Uint8Array) => {
        array.set([bytes.shift() ?? 0]);
        return array;
      },
    });
    const random = vi.spyOn(Math, "random").mockImplementation(() => {
      throw new Error("Math.random is not the browser's randomness");
    });
    try {
      expect(drawGuestNick()).toBe("guest-az09a9");
      expect(bytes).toEqual([]);
    } finally {
      random.mockRestore();
      vi.unstubAllGlobals();
    }
  });
});

// An Ergo with no draft/multiline (docs/decisions.md, 2026-10-26): it NAKs the whole request, so the page asks again
// without the capability and the chat goes on, its drafts sent a line at a time.
describe("connectErgo, an Ergo that offers no draft/multiline", () => {
  const guest = async () => {
    const t = setup({ guests: ["guest-ab12cd"] });
    await t.settle();
    t.last().open();
    return { ...t, s: t.last() };
  };

  it("asks the capabilities again, without draft/multiline alone, after the NAK of its first request", async () => {
    expect(BASIC_CAPS).toBe(KIT_CAPS.replace(" draft/multiline", ""));
    const t = await guest();
    t.s.say(`:ergo CAP * NAK :${CAPS}`);
    expect(t.s.sent).toEqual(["CAP LS 302", `CAP REQ :${CAPS}`, `CAP REQ :${BASIC_CAPS}`]);
    expect(t.s.closed).toBe(false);
    t.s.say(`:ergo CAP * ACK :${BASIC_CAPS}`);
    expect(t.s.sent.at(-1)).toBe("USER u 0 * :guest-ab12cd");
  });

  it("says whether the connection sends several lines at once: only once connected, only on an ACK holding it", async () => {
    const full = await guest();
    expect(full.client.multiline()).toBe(false);
    welcomeGuest(full.s, "guest-ab12cd");
    expect(full.client.multiline()).toBe(true);
    const basic = await guest();
    basic.s.say(`:ergo CAP * NAK :${CAPS}`);
    basic.s.say(`:ergo CAP * ACK :${BASIC_CAPS}`);
    basic.s.say(":ergo 001 guest-ab12cd :Welcome");
    motd(basic.s);
    expect(basic.client.multiline()).toBe(false);
  });

  it("says an account's connection sends several lines at once, once its SASL and its welcome have passed", async () => {
    const t = await connected();
    expect(t.client.multiline()).toBe(true);
  });

  it("fails on a second NAK of the whole list too, asking no third", async () => {
    const t = await guest();
    t.s.say(`:ergo CAP * NAK :${CAPS}`);
    t.s.say(`:ergo CAP * NAK :${CAPS}`);
    expect(t.s.closed).toBe(true);
    expect(t.s.sent.filter((line) => line.startsWith("CAP REQ"))).toHaveLength(2);
  });

  it("fails on a second NAK, the request without draft/multiline refused too, and asks no third", async () => {
    const t = await guest();
    t.s.say(`:ergo CAP * NAK :${CAPS}`);
    t.s.say(`:ergo CAP * NAK :${BASIC_CAPS}`);
    expect(t.s.closed).toBe(true);
    expect(t.s.sent.filter((line) => line.startsWith("CAP REQ"))).toHaveLength(2);
  });

  it("asks draft/multiline again on its next connection", async () => {
    const t = await guest();
    t.s.say(`:ergo CAP * NAK :${CAPS}`);
    t.s.say(`:ergo CAP * NAK :${BASIC_CAPS}`);
    await t.run(t.backoffs()[0]);
    t.last().open();
    expect(t.last().sent).toEqual(["CAP LS 302", `CAP REQ :${CAPS}`]);
  });
});
