import { createHmac } from "node:crypto";
import { once } from "node:events";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { connect, type AddressInfo, type Server } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { Address, toAddress } from "@gnoworld/schemas";
import fc from "fast-check";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { openDatabase } from "../db.ts";
import { logger } from "../log.ts";
import { LOGIN_TABLES } from "../login/login.ts";
import { makeTickets, TICKET_TABLES } from "../login/ticket.ts";
import { authServer, listenAt } from "./auth.ts";

const T0 = Date.parse("2026-10-22T12:00:00.000Z");
const MINUTE = 60_000;
const PEPPER = "a-pepper-of-forty-characters-0123456789";
const ME = Address.parse("g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5");
const OTHER = Address.parse(toAddress(new Uint8Array(20).fill(7)));
const IP = "203.0.113.7";
// Ergo's answers, as its auth-script reads them (irc/authscript.go, AuthScriptOutput), one line each.
const YES = (account: string): string => `${JSON.stringify({ success: true, accountName: account })}\n`;
const NO = `${JSON.stringify({ success: false })}\n`;
const Event = z.object({ event: z.string(), error: z.string().optional(), account: z.string().optional() });

const opened: { db: DatabaseSync; server: Server }[] = [];
afterEach(async () => {
  vi.useRealTimers();
  for (const { db, server } of opened.splice(0)) {
    server.close();
    await once(server, "close");
    if (db.isOpen) db.close();
  }
});

const start = async (db: DatabaseSync, options: Omit<Parameters<typeof authServer>[1], "log"> = {}) => {
  const lines: string[] = [];
  const server = authServer(db, { log: logger(PEPPER, (line) => lines.push(line)), ...options });
  opened.push({ db, server });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address() as AddressInfo;
  // What Ergo does (irc/script.go, RunScriptOverSocket): it writes the line, then reads one back.
  const ask = async (sent: string | Uint8Array, { end = false } = {}): Promise<string> => {
    const socket = connect(port, "127.0.0.1");
    let answer = "";
    socket.setEncoding("utf8");
    socket.on("data", (chunk: string) => (answer += chunk));
    socket.on("error", () => undefined);
    if (end) socket.end(sent);
    else socket.write(sent);
    await once(socket, "close");
    return answer;
  };
  const events = () => lines.map((text) => Event.parse(JSON.parse(text)));
  return { server, port, ask, events };
};

const setup = async (options: { deadlineMs?: number } = {}) => {
  const db = openDatabase(":memory:", [LOGIN_TABLES, TICKET_TABLES]);
  for (const address of [ME, OTHER])
    db.prepare("INSERT INTO accounts (address, first_seen) VALUES (?, ?)").run(address, T0);
  const clock = { now: T0 };
  const tickets = makeTickets(db, { now: () => clock.now });
  const started = await start(db, { now: () => clock.now, ...options });
  return { ...started, db, clock, tickets };
};

const line = (fields: Record<string, unknown>): string => `${JSON.stringify(fields)}\n`;
const wrong = (ip?: string): string =>
  line({ accountName: ME, passphrase: "A".repeat(43), ...(ip === undefined ? {} : { ip }) });

describe("Ergo's auth script, answered by the server", () => {
  it("logs in the ticket's account, under its address, and closes", async () => {
    const { tickets, ask } = await setup();
    expect(await ask(line({ accountName: ME, passphrase: tickets.mint(ME), ip: IP }))).toBe(YES(ME));
  });

  it("takes the fields Ergo adds and the server never reads (a certificate, the upgrade's cookies)", async () => {
    const { tickets, ask } = await setup();
    const cookies = [{ name: "__Host-session", value: "x".repeat(43) }];
    const sent = line({ accountName: ME, passphrase: tickets.mint(ME), ip: IP, certfp: "ab", cookies });
    expect(await ask(sent)).toBe(YES(ME));
  });

  it.each([
    ["another account's ticket", (ticket: string) => ({ accountName: OTHER, passphrase: ticket, ip: IP }), "ticket"],
    ["an unknown ticket", () => ({ accountName: ME, passphrase: "A".repeat(43), ip: IP }), "ticket"],
    ["no ticket", () => ({ accountName: ME, ip: IP }), "frame"],
    ["no account", (ticket: string) => ({ passphrase: ticket, ip: IP }), "frame"],
    ["an account in capitals", (ticket: string) => ({ accountName: ME.toUpperCase(), passphrase: ticket }), "account"],
    ["an account that is an object", (ticket: string) => ({ accountName: { ME }, passphrase: ticket }), "frame"],
    ["a ticket that is not a string", () => ({ accountName: ME, passphrase: 1 }), "frame"],
  ])("refuses %s, logging its cause", async (_, fields, cause) => {
    const { tickets, ask, events } = await setup();
    expect(await ask(line(fields(tickets.mint(ME))))).toBe(NO);
    expect(events()).toEqual([{ event: "irc_login_refused", error: cause }]);
  });

  it("refuses a spent ticket, and the same ticket twice at once logs in once", async () => {
    const { tickets, ask } = await setup();
    const sent = line({ accountName: ME, passphrase: tickets.mint(ME), ip: IP });
    const answers = await Promise.all([ask(sent), ask(sent)]);
    expect(answers.toSorted()).toEqual([NO, YES(ME)].toSorted());
    expect(await ask(sent)).toBe(NO);
  });

  it("answers the first line alone: a second line in the same write spends nothing", async () => {
    const { tickets, ask } = await setup();
    const [first, second] = [tickets.mint(ME), tickets.mint(ME)];
    const sent = line({ accountName: ME, passphrase: first }) + line({ accountName: ME, passphrase: second });
    expect(await ask(sent)).toBe(YES(ME));
    expect(await ask(line({ accountName: ME, passphrase: second }))).toBe(YES(ME));
  });

  it("takes a line of 16 KiB, and refuses one byte more before reading its ticket", async () => {
    const { tickets, ask } = await setup();
    const padded = (ticket: string, size: number): string => {
      const bare = JSON.stringify({ accountName: ME, passphrase: ticket, pad: "" });
      return `${JSON.stringify({ accountName: ME, passphrase: ticket, pad: "x".repeat(size - bare.length) })}\n`;
    };
    const ticket = tickets.mint(ME);
    expect(await ask(padded(ticket, 16 * 1024 + 1))).toBe(NO);
    expect(await ask(padded(ticket, 16 * 1024))).toBe(YES(ME));
  });

  it.each([
    ["text that is not JSON", "not json\n"],
    ["JSON that is not an object", "[1,2]\n"],
    ["null", "null\n"],
    ["a line past 16 KiB that never ends", "x".repeat(16 * 1024 + 1)],
  ])("refuses %s at once as a bad frame, and stays up for the next", async (_, sent) => {
    const { tickets, ask, events } = await setup();
    expect(await ask(sent)).toBe(NO);
    expect(events()).toEqual([{ event: "irc_login_refused", error: "frame" }]);
    expect(await ask(line({ accountName: ME, passphrase: tickets.mint(ME) }))).toBe(YES(ME));
  });

  it("takes a line of 16 KiB whose end of line comes in a later write", async () => {
    const { tickets, port } = await setup();
    const bare = JSON.stringify({ accountName: ME, passphrase: tickets.mint(ME), pad: "" });
    const full = bare.replace('"pad":""', `"pad":"${"x".repeat(16 * 1024 - bare.length)}"`);
    const socket = connect(port, "127.0.0.1");
    let answer = "";
    socket.setEncoding("utf8");
    socket.on("data", (chunk: string) => (answer += chunk));
    socket.write(full);
    // The server reads the full 16 KiB, its end of line not yet there, before the end comes.
    await new Promise((resolve) => setTimeout(resolve, 50));
    socket.write("\n");
    await new Promise((resolve) => socket.on("close", resolve));
    expect(answer).toBe(YES(ME));
  });

  it("clears its deadline when a client goes before its line ends", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { server, port } = await setup();
    const socket = connect(port, "127.0.0.1");
    socket.on("error", () => undefined);
    await once(server, "connection");
    expect(vi.getTimerCount()).toBe(1);
    socket.resetAndDestroy();
    for (let n = 0; n < 100 && vi.getTimerCount() > 0; n += 1) await new Promise((resolve) => setImmediate(resolve));
    expect(vi.getTimerCount()).toBe(0);
  });

  it("refuses any shape of a frame Ergo could send with no valid ticket, and stays up", async () => {
    const { tickets, ask } = await setup();
    const frame = fc.record({
      accountName: fc.string(),
      passphrase: fc.string(),
      ip: fc.option(fc.string(), { nil: undefined }),
    });
    await fc.assert(
      fc.asyncProperty(frame, async (fields) => {
        expect(await ask(line(fields))).toBe(NO);
      }),
      { numRuns: 60 },
    );
    expect(await ask(line({ accountName: ME, passphrase: tickets.mint(ME), ip: "198.51.100.200" }))).toBe(YES(ME));
  });

  it("refuses a frame whose end of line never came, a whole one included, spending nothing", async () => {
    const { tickets, ask, events } = await setup();
    const ticket = tickets.mint(ME);
    const whole = JSON.stringify({ accountName: ME, passphrase: ticket });
    expect(await ask(whole.slice(0, 30), { end: true })).toBe(NO);
    expect(await ask(whole, { end: true })).toBe(NO);
    expect(await ask(`${whole}\n`)).toBe(YES(ME));
    expect(events().map(({ error }) => error)).toEqual(["frame", "frame", undefined]);
  });

  it("answers anything with a refusal, never a crash: any JSON, any bytes", async () => {
    const { tickets, ask } = await setup();
    await fc.assert(
      fc.asyncProperty(fc.anything(), async (value) => {
        expect(await ask(`${JSON.stringify(value)}\n`)).toBe(NO);
      }),
      { numRuns: 60 },
    );
    await fc.assert(
      fc.asyncProperty(fc.uint8Array({ maxLength: 512 }), async (bytes) => {
        expect(await ask(bytes, { end: true })).toBe(NO);
      }),
      { numRuns: 60 },
    );
    expect(await ask(line({ accountName: ME, passphrase: tickets.mint(ME), ip: IP }))).toBe(YES(ME));
  });

  it("stays up when a client resets the connection as the answer goes out", async () => {
    const { tickets, port, ask } = await setup();
    for (let n = 0; n < 20; n += 1) {
      const socket = connect(port, "127.0.0.1");
      socket.on("error", () => undefined);
      socket.write(line({ accountName: ME, passphrase: tickets.mint(ME) }));
      socket.resetAndDestroy();
    }
    expect(await ask(line({ accountName: ME, passphrase: tickets.mint(ME) }))).toBe(YES(ME));
  });

  it("ends a connection whose line has not come 5 s after it opened, by default", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { server, port } = await setup();
    const socket = connect(port, "127.0.0.1");
    socket.on("error", () => undefined);
    let ended = false;
    // Not events.once: the deadline's reset arrives as an error before the close.
    const closed = new Promise((resolve) => socket.on("close", resolve)).then(() => (ended = true));
    await once(server, "connection");
    socket.write('{"accountName"');
    vi.advanceTimersByTime(4999);
    await new Promise((resolve) => setImmediate(resolve));
    expect(ended).toBe(false);
    vi.advanceTimersByTime(1);
    await closed;
  });

  it("ends a connection that trickles its line slower than the deadline, however it keeps sending", async () => {
    const { port } = await setup({ deadlineMs: 100 });
    const socket = connect(port, "127.0.0.1");
    socket.on("error", () => undefined);
    let answer = "";
    socket.setEncoding("utf8");
    socket.on("data", (chunk: string) => (answer += chunk));
    const closed = new Promise((resolve) => socket.on("close", resolve));
    const drip = setInterval(() => socket.write("x"), 20);
    await closed;
    clearInterval(drip);
    expect(answer).toBe("");
  });

  it("counts failures per visitor, never per account: past 10 a minute, a visitor is refused before any read", async () => {
    const { clock, tickets, ask } = await setup();
    for (let n = 0; n < 9; n += 1) expect(await ask(wrong(IP))).toBe(NO);
    expect(await ask(line({ accountName: ME, passphrase: tickets.mint(ME), ip: IP }))).toBe(YES(ME));
    expect(await ask(wrong(IP))).toBe(NO);
    const ticket = tickets.mint(ME);
    expect(await ask(line({ accountName: ME, passphrase: ticket, ip: IP }))).toBe(NO);
    // Not spent by the refused try, and the same account logs in from elsewhere.
    expect(await ask(line({ accountName: ME, passphrase: ticket, ip: "198.51.100.9" }))).toBe(YES(ME));
    clock.now += MINUTE;
    expect(await ask(line({ accountName: ME, passphrase: tickets.mint(ME), ip: IP }))).toBe(YES(ME));
  });

  it("never counts a login: a visitor behind one address logs in as often as it has tickets", async () => {
    const { tickets, ask } = await setup();
    for (let n = 0; n < 12; n += 1) {
      expect(await ask(line({ accountName: ME, passphrase: tickets.mint(ME), ip: IP }))).toBe(YES(ME));
    }
  });

  it("counts an IPv6 visitor by its /64", async () => {
    const { tickets, ask } = await setup();
    for (let n = 1; n <= 10; n += 1) expect(await ask(wrong(`2001:db8:1:2::${String(n)}`))).toBe(NO);
    expect(await ask(line({ accountName: ME, passphrase: tickets.mint(ME), ip: "2001:db8:1:2::ff" }))).toBe(NO);
    expect(await ask(line({ accountName: ME, passphrase: tickets.mint(ME), ip: "2001:db8:1:3::1" }))).toBe(YES(ME));
  });

  it("counts an ip that is no address with the lines that have none: it never becomes a key of its own", async () => {
    const { tickets, ask } = await setup();
    for (let n = 0; n < 4; n += 1) expect(await ask(wrong("not an ip"))).toBe(NO);
    for (let n = 0; n < 3; n += 1) expect(await ask(wrong("x".repeat(10_000)))).toBe(NO);
    for (let n = 0; n < 3; n += 1) expect(await ask(wrong())).toBe(NO);
    expect(await ask(line({ accountName: ME, passphrase: tickets.mint(ME) }))).toBe(NO);
    expect(await ask(line({ accountName: ME, passphrase: tickets.mint(ME), ip: IP }))).toBe(YES(ME));
  });

  it("counts the lines with no address together, and logs the limit when they pass it", async () => {
    const { tickets, ask, events } = await setup();
    for (let n = 0; n < 10; n += 1) expect(await ask(wrong())).toBe(NO);
    expect(await ask(line({ accountName: ME, passphrase: tickets.mint(ME) }))).toBe(NO);
    expect(events().at(-1)).toEqual({ event: "irc_login_refused", error: "limit" });
    expect(await ask(line({ accountName: ME, passphrase: tickets.mint(ME), ip: IP }))).toBe(YES(ME));
  });

  it("logs a login with the account hashed and each refusal with its cause, never the ticket or the frame", async () => {
    const { tickets, ask, events } = await setup();
    const ticket = tickets.mint(ME);
    await ask(line({ accountName: ME, passphrase: ticket, ip: IP }));
    await ask(line({ accountName: ME, passphrase: ticket, ip: IP }));
    await ask(line({ accountName: ME.toUpperCase(), passphrase: ticket, ip: IP }));
    await ask("not json\n");
    for (let n = 0; n < 8; n += 1) await ask(wrong(IP));
    await ask(wrong(IP));
    const seen = events();
    expect(seen.slice(0, 4)).toEqual([
      { event: "irc_login", account: createHmac("sha256", PEPPER).update(ME).digest("hex") },
      { event: "irc_login_refused", error: "ticket" },
      { event: "irc_login_refused", error: "account" },
      { event: "irc_login_refused", error: "frame" },
    ]);
    expect(seen.at(-1)).toEqual({ event: "irc_login_refused", error: "limit" });
    const text = JSON.stringify(seen);
    for (const secret of [ticket, ME, "not json"]) expect(text).not.toContain(secret);
  });

  it.each([
    [
      "closed",
      (db: DatabaseSync) => {
        db.close();
      },
    ],
    [
      "refusing writes, as a full disk does",
      (db: DatabaseSync) => {
        db.exec("PRAGMA query_only = ON");
      },
    ],
  ])("refuses, and stays up, when its database is %s", async (_, fail) => {
    const db = openDatabase(":memory:", [LOGIN_TABLES, TICKET_TABLES]);
    db.prepare("INSERT INTO accounts (address, first_seen) VALUES (?, ?)").run(ME, T0);
    const ticket = makeTickets(db, { now: Date.now }).mint(ME);
    const { ask, events } = await start(db);
    fail(db);
    expect(await ask(line({ accountName: ME, passphrase: ticket, ip: IP }))).toBe(NO);
    expect(events()).toEqual([{ event: "irc_login_refused", error: "failed" }]);
    expect(await ask(line({ accountName: ME, passphrase: ticket, ip: IP }))).toBe(NO);
  });

  it("keeps the system's clock by default: a ticket minted at another time is refused", async () => {
    const db = openDatabase(":memory:", [LOGIN_TABLES, TICKET_TABLES]);
    db.prepare("INSERT INTO accounts (address, first_seen) VALUES (?, ?)").run(ME, T0);
    const { ask } = await start(db);
    const [past, now] = [
      makeTickets(db, { now: () => Date.parse("2020-01-01T00:00:00.000Z") }),
      makeTickets(db, { now: Date.now }),
    ];
    expect(await ask(line({ accountName: ME, passphrase: past.mint(ME) }))).toBe(NO);
    expect(await ask(line({ accountName: ME, passphrase: now.mint(ME) }))).toBe(YES(ME));
  });
});

describe("listenAt", () => {
  // The sandbox binds no Unix socket, so only the refusals are tried here; the bind is 3e's operator test.
  it("refuses a path it cannot listen on, naming the setting, and leaves a file there as it was", async () => {
    const dir = mkdtempSync(join(tmpdir(), "gnoworld-auth-"));
    try {
      const taken = join(dir, "taken");
      writeFileSync(taken, "not a socket");
      const db = openDatabase(":memory:", [LOGIN_TABLES, TICKET_TABLES]);
      for (const path of [taken, join(dir, "missing", "auth.sock")]) {
        const server = authServer(db, { log: logger(PEPPER, () => true) });
        const error = await listenAt(server, path).then(
          () => undefined,
          (thrown: unknown) => thrown,
        );
        const { message, cause } = z
          .object({ message: z.string(), cause: z.object({ code: z.string() }) })
          .parse(error);
        expect(message).toMatch(/^setting AUTH_SOCKET: /);
        expect(typeof cause.code).toBe("string");
      }
      db.close();
      expect(readFileSync(taken, "utf8")).toBe("not a socket");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
