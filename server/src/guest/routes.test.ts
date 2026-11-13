import type { DatabaseSync } from "node:sqlite";
import { GUEST_NAME_BYTES } from "@gnoworld/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { makeApp } from "../app.ts";
import { migrations } from "../migrations.ts";
import { withBreaker } from "../moderation/check.ts";
import type { Answer } from "../moderation/provider.ts";
import type { Rules } from "../roles/roles.ts";
import { openDatabase } from "@gnoworld/service/db";
import { logger } from "@gnoworld/service/log";
import { guestFrom, type Outside, type Settings } from "./routes.ts";

// Written out, not imported: a cookie that loses its __Host- prefix must fail here.
const COOKIE = "__Host-guest";
const SESSION = "__Host-session";
const PEPPER = "a-pepper-of-forty-characters-0123456789";
const ORIGIN = "https://gnoworld.test";
const PEER = "203.0.113.7";
const PROXY = "10.0.0.2";
const T0 = Date.parse("2026-11-09T12:00:00.000Z");
const SECOND = 1000;
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const ACCOUNT = "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5";
const WORLD: Rules = { bannedWords: ["spam"], linksPerMessage: 3, mentionsPerMessage: 5, linksForNewAccount: 2 };
const NAME = /^[a-z]+-[a-z]+-[a-z2-7]{4}$/;
const Said = z.object({ error: z.string().optional(), cause: z.string().optional(), ok: z.boolean().optional() });
const Named = z.object({ name: z.string() });
const NOTHING: Answer = {
  flagged: Object.fromEntries(
    [
      "harassment",
      "harassment/threatening",
      "hate",
      "hate/threatening",
      "illicit",
      "illicit/violent",
      "self-harm",
      "self-harm/instructions",
      "self-harm/intent",
      "sexual",
      "sexual/minors",
      "violence",
      "violence/graphic",
    ].map((c) => [c, false]),
  ) as Answer["flagged"],
  scores: Object.fromEntries(
    [
      "harassment",
      "harassment/threatening",
      "hate",
      "hate/threatening",
      "illicit",
      "illicit/violent",
      "self-harm",
      "self-harm/instructions",
      "self-harm/intent",
      "sexual",
      "sexual/minors",
      "violence",
      "violence/graphic",
    ].map((c) => [c, 0]),
  ) as Answer["scores"],
};
const HATE: Answer = { flagged: { ...NOTHING.flagged, hate: true }, scores: { ...NOTHING.scores, hate: 0.9 } };

const opened: DatabaseSync[] = [];
afterEach(() => {
  vi.useRealTimers();
  for (const db of opened.splice(0)) db.close();
});

interface Setup {
  guests?: Partial<Settings["guests"]>;
  on?: boolean;
  thresholds?: Settings["moderation"]["thresholds"];
  provider?: Outside["provider"] | "none";
  defaults?: Rules;
  rulesOf?: Outside["rulesOf"];
  relay?: Outside["relay"];
  session?: Outside["session"];
  mute?: Settings["moderation"]["mute"];
  random?: Outside["random"];
}

type ProviderFn = (text: string) => Promise<Answer | "unchecked">;
type Relayed = { msgid: string } | false | "unsure";
type RelayFn = (room: string, nick: string, text: string) => Promise<Relayed>;
const ACCESS: Record<string, "write" | "read"> = {
  "#earth": "write",
  "#earth/kyoto": "write",
  "#bubble": "write",
  "#earth/news": "read",
};
const MUTE = { strikes: 3, windowMinutes: 10, minutes: 5 };

const settingsOf = ({ on = true, guests, thresholds = {}, mute = MUTE }: Setup): Settings => ({
  origins: [ORIGIN],
  trustedProxy: PROXY,
  guests: { on, perVisitor: 10, perHour: 600, living: 5000, ...guests },
  moderation: { thresholds, mute },
});

const setup = (options: Setup = {}) => {
  const db = openDatabase(":memory:", migrations);
  opened.push(db);
  const clock = { now: T0 };
  const lines: string[] = [];
  const log = logger(PEPPER, (line) => lines.push(line));
  const provider = vi.fn<ProviderFn>(() => Promise.resolve(NOTHING));
  const relay = vi.fn<RelayFn>(() => Promise.resolve({ msgid: "m1" }));
  const counted = vi.fn();
  const passed = vi.fn();
  const access = vi.fn<(room: string, world: string) => "write" | "read" | undefined>((room) => ACCESS[room]);
  const worldOf = vi.fn((room: string) => room.slice(1).split("/")[0]);
  const { rulesOf = (world) => (["earth", "bubble"].includes(world) ? WORLD : undefined) } = options;
  const rulesSpy = vi.fn<(world: string) => Rules | undefined>(rulesOf);
  const outside: Outside = {
    log,
    pepper: PEPPER,
    now: () => clock.now,
    session: options.session ?? ((token) => (token === "account-session" ? ACCOUNT : undefined)),
    access,
    worldOf,
    rulesOf: rulesSpy,
    defaults: options.defaults,
    // Behind the breaker the server makes around the provider (checker.ts's providerOf), as the route is given it.
    provider:
      options.provider === "none"
        ? undefined
        : withBreaker(options.provider ?? provider, { now: () => clock.now, log }),
    relay: options.relay ?? relay,
    counted,
    passed,
    ...(options.random === undefined ? {} : { random: options.random }),
  };
  const app = makeApp(log, () => true);
  app.route("/api/guest", guestFrom(db, settingsOf(options), outside));
  return { app, db, clock, lines, provider, relay, counted, passed, access, worldOf, rulesSpy };
};
type App = ReturnType<typeof setup>["app"];

interface Sent {
  body?: unknown;
  origin?: string | undefined;
  type?: string;
  peer?: string;
  cookie?: string;
  headers?: Record<string, string>;
}
interface Who {
  cookie: string;
  peer: string;
}
const connection = (peer: string) => ({ incoming: { socket: { remoteAddress: peer } } });
const post = async (app: App, path: "" | "/say", sent: Sent = {}) => {
  const { body = {}, type = "application/json", headers = {}, peer = PEER, cookie } = sent;
  const origin = "origin" in sent ? sent.origin : ORIGIN;
  return app.request(
    `/api/guest${path}`,
    {
      method: "POST",
      headers: {
        "content-type": type,
        ...(origin === undefined ? {} : { origin }),
        ...(cookie === undefined ? {} : { cookie }),
        ...headers,
      },
      body: typeof body === "string" ? body : JSON.stringify(body),
    },
    connection(peer),
  );
};
const tokenOf = (res: Response): string => {
  const found = new RegExp(`${COOKIE}=([^;]+)`).exec(res.headers.get("set-cookie") ?? "");
  if (found?.[1] === undefined) throw new Error("no guest cookie");
  return found[1];
};
const asGuest = (token: string): string => `${COOKIE}=${token}`;
// A guest from a peer: its cookie and its name.
const arrive = async (app: App, peer = PEER) => {
  const res = await post(app, "", { peer });
  expect(res.status).toBe(200);
  return { cookie: asGuest(tokenOf(res)), name: Named.parse(await res.json()).name, peer };
};
const say = async (app: App, who: Who, ...[text, room = "#earth"]: [text: string, room?: string]) =>
  post(app, "/say", { cookie: who.cookie, peer: who.peer, body: { room, text } });
const said = async (res: Response) => ({ status: res.status, ...Said.parse(await res.json()) });
const count = (db: DatabaseSync, table: string): number =>
  z.object({ n: z.number() }).parse(db.prepare(`SELECT count(*) AS n FROM ${table}`).get()).n;
const dump = (db: DatabaseSync): string => JSON.stringify(db.prepare("SELECT * FROM guests").all());

describe("POST /api/guest: a name and a cookie", () => {
  it("answers a random name and sets __Host-guest: HttpOnly, Secure, SameSite=Strict, for the whole site, never persistent", async () => {
    const { app } = setup();
    const res = await post(app, "");
    expect(res.status).toBe(200);
    expect(Named.parse(await res.json()).name).toMatch(NAME);
    const cookie = res.headers.get("set-cookie") ?? "";
    expect(cookie).toMatch(new RegExp(`^${COOKIE}=[A-Za-z0-9_-]{43};`));
    for (const part of ["Path=/", "HttpOnly", "Secure", "SameSite=Strict"]) expect(cookie).toContain(part);
    expect(cookie).not.toMatch(/Max-Age|Expires|Domain/i);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("stores the cookie as its SHA-256 and the visitor as a hash: neither the value nor the address is kept", async () => {
    const { app, db } = setup();
    const res = await post(app, "");
    expect(dump(db)).not.toContain(tokenOf(res));
    expect(dump(db)).not.toContain(PEER);
    const [row] = db.prepare("SELECT length(token_hash) AS t, length(visitor_hash) AS v FROM guests").all();
    expect(row).toEqual({ t: 32, v: 64 });
  });

  it("gives the same visitor the same hash and another visitor another, an IPv6 /64 being one visitor", async () => {
    const { app, db } = setup();
    for (const peer of [PEER, PEER, "198.51.100.1", "2001:db8:1:2::1", "2001:db8:1:2:ffff::9"]) await arrive(app, peer);
    const hashes = db.prepare("SELECT visitor_hash AS v FROM guests ORDER BY id").all() as { v: string }[];
    expect(hashes[0]?.v).toBe(hashes[1]?.v);
    expect(hashes[2]?.v).not.toBe(hashes[0]?.v);
    expect(hashes[3]?.v).toBe(hashes[4]?.v);
    expect(hashes[3]?.v).not.toBe(hashes[0]?.v);
  });

  it("answers the same name, with no new row and no new cookie, to a request that holds a living guest cookie", async () => {
    const { app, db } = setup();
    const first = await arrive(app);
    const again = await post(app, "", { cookie: first.cookie });
    expect(again.status).toBe(200);
    expect(Named.parse(await again.json()).name).toBe(first.name);
    expect(again.headers.get("set-cookie")).toBeNull();
    expect(count(db, "guests")).toBe(1);
  });

  it("gives a new guest to a cookie it does not know or has purged, and ignores a name the client sends", async () => {
    const { app, db } = setup();
    const res = await post(app, "", { cookie: asGuest("x".repeat(43)), body: { name: "mine-mine-aaaa" } });
    expect(res.status).toBe(200);
    expect(Named.parse(await res.json()).name).not.toBe("mine-mine-aaaa");
    expect(count(db, "guests")).toBe(1);
  });

  it("refuses an Origin that is not listed or missing, and a body that is not JSON, before any work: no row, no cookie", async () => {
    const { app, db } = setup();
    const [foreign, none, form] = await Promise.all([
      post(app, "", { origin: "https://evil.test" }),
      post(app, "", { origin: undefined }),
      post(app, "", { type: "text/plain" }),
    ]);
    expect([foreign.status, none.status, form.status]).toEqual([403, 403, 415]);
    expect([foreign, none, form].map((res) => res.headers.get("set-cookie"))).toEqual([null, null, null]);
    expect(count(db, "guests")).toBe(0);
  });

  it("refuses a body that is not JSON text or not an object with 400 refused, and makes no guest", async () => {
    const { app, db } = setup();
    const bodies = ["not json", "[]", "null", "3"];
    const answers = await Promise.all(bodies.map((body) => post(app, "", { body })));
    expect(answers.map((res) => res.status)).toEqual([400, 400, 400, 400]);
    expect(count(db, "guests")).toBe(0);
  });
});

describe("POST /api/guest: the limits come before any work (plan 3.3)", () => {
  it("refuses the 11th new name an hour from one visitor with too_many, and serves another visitor", async () => {
    const { app, db } = setup();
    for (let n = 0; n < 10; n += 1) expect((await post(app, "")).status).toBe(200);
    const refused = await post(app, "");
    expect([refused.status, await refused.json()]).toEqual([429, { error: "too_many" }]);
    expect(refused.headers.get("set-cookie")).toBeNull();
    expect(count(db, "guests")).toBe(10);
    expect((await post(app, "", { peer: "198.51.100.1" })).status).toBe(200);
  });

  it("serves the visitor again an hour after its window began, not before", async () => {
    const { app, clock } = setup({ guests: { perVisitor: 1 } });
    await post(app, "");
    clock.now = T0 + HOUR - 1;
    expect((await post(app, "")).status).toBe(429);
    clock.now = T0 + HOUR;
    expect((await post(app, "")).status).toBe(200);
  });

  it("refuses the name past the hour's total across visitors, and past the guests living", async () => {
    const total = setup({ guests: { perHour: 3 } });
    for (const n of [1, 2, 3])
      expect((await post(total.app, "", { peer: `198.51.100.${String(n)}` })).status).toBe(200);
    expect((await post(total.app, "", { peer: "198.51.100.9" })).status).toBe(429);
    const living = setup({ guests: { living: 2 } });
    for (const n of [1, 2]) expect((await post(living.app, "", { peer: `198.51.100.${String(n)}` })).status).toBe(200);
    expect((await post(living.app, "", { peer: "198.51.100.9" })).status).toBe(429);
    expect(count(living.db, "guests")).toBe(2);
  });

  it("takes a living cookie's request past every limit: its name back, costing no new name", async () => {
    const { app } = setup({ guests: { perVisitor: 1, perHour: 1, living: 1 } });
    const first = await arrive(app);
    for (let n = 0; n < 5; n += 1) expect((await post(app, "", { cookie: first.cookie })).status).toBe(200);
  });

  it("counts an IPv6 /64 as one visitor, and a header only when the trusted proxy sets it", async () => {
    const v6 = setup({ guests: { perVisitor: 1 } });
    expect((await post(v6.app, "", { peer: "2001:db8:1:2::1" })).status).toBe(200);
    expect((await post(v6.app, "", { peer: "2001:db8:1:2:ffff::9" })).status).toBe(429);
    const { app } = setup({ guests: { perVisitor: 1 } });
    const through = (peer: string, real: string) => post(app, "", { peer, headers: { "x-real-ip": real } });
    expect((await through(PROXY, "198.51.100.1")).status).toBe(200);
    expect((await through(PROXY, "198.51.100.2")).status).toBe(200);
    expect((await through(PROXY, "198.51.100.1")).status).toBe(429);
    // Not from the proxy: the header is a forgery, the peer is the visitor.
    expect((await through("203.0.113.50", "198.51.100.77")).status).toBe(200);
    expect((await through("203.0.113.50", "198.51.100.78")).status).toBe(429);
  });

  it("refuses before it draws a name: a refused request leaves no row and no log of a name", async () => {
    const { app, db, lines } = setup({ guests: { perVisitor: 1 } });
    await post(app, "");
    await post(app, "");
    expect(count(db, "guests")).toBe(1);
    expect(lines.join("\n")).not.toContain(PEER);
  });
});

describe("a visitor under a guest mute, and an account", () => {
  it("gets no new name while its mute lives, its cookie's name back, and a name when the mute ends", async () => {
    const { app, db, clock } = setup();
    const first = await arrive(app);
    const visitor = (db.prepare("SELECT visitor_hash AS v FROM guests").get() as { v: string }).v;
    db.prepare("INSERT INTO guest_mutes (visitor_hash, world, until) VALUES (?, 'earth', ?)").run(
      visitor,
      T0 + 5 * MINUTE,
    );
    const refused = await post(app, "", { peer: PEER });
    expect([refused.status, await said(refused)]).toEqual([403, { status: 403, error: "forbidden", cause: "muted" }]);
    expect(count(db, "guests")).toBe(1);
    expect((await post(app, "", { cookie: first.cookie })).status).toBe(200);
    expect((await post(app, "", { peer: "198.51.100.1" })).status).toBe(200);
    clock.now = T0 + 5 * MINUTE;
    expect((await post(app, "", { peer: PEER })).status).toBe(200);
  });

  it("never gives an account a guest's name: a login session wins, with 403 forbidden and no row", async () => {
    const { app, db } = setup();
    const res = await post(app, "", { cookie: `${SESSION}=account-session` });
    expect([res.status, await res.json()]).toEqual([403, { error: "forbidden" }]);
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(count(db, "guests")).toBe(0);
  });

  it("lets an account that also holds a guest cookie keep to its session: no guest name back either", async () => {
    const { app } = setup();
    const guest = await arrive(app);
    const res = await post(app, "", { cookie: `${SESSION}=account-session; ${guest.cookie}` });
    expect(res.status).toBe(403);
  });
});

describe("GUEST_CHAT=off", () => {
  it("answers 404 to both routes, whatever the request, and does nothing: no row, no relay, no provider", async () => {
    const { app, db, relay, provider } = setup({ on: false });
    const answers = await Promise.all([
      post(app, ""),
      post(app, "", { origin: "https://evil.test" }),
      post(app, "/say", { cookie: asGuest("x".repeat(43)), body: { room: "#earth", text: "hi" } }),
      post(app, "/say", { type: "text/plain" }),
    ]);
    expect(answers.map((res) => res.status)).toEqual([404, 404, 404, 404]);
    expect(await answers[0].json()).toEqual({ error: "not_found" });
    expect(count(db, "guests")).toBe(0);
    expect(relay).not.toHaveBeenCalled();
    expect(provider).not.toHaveBeenCalled();
  });

  it("is a switch of the settings alone: the same code with it on makes the guest", async () => {
    expect((await post(setup({ on: true }).app, "")).status).toBe(200);
  });
});

describe("POST /api/guest/say: who and where", () => {
  it("relays a line to the room as anon/<name> and answers once Ergo took it; counts it for the plate", async () => {
    const { app, relay, counted, clock } = setup();
    const guest = await arrive(app);
    clock.now = T0 + SECOND;
    const res = await say(app, guest, "  hello there  ");
    expect([res.status, await res.json()]).toEqual([200, { ok: true }]);
    expect(relay).toHaveBeenCalledExactlyOnceWith("#earth", `anon/${guest.name}`, "hello there");
    expect(counted).toHaveBeenCalledExactlyOnceWith("#earth", guest.name, T0 + SECOND);
  });

  it("answers only after the relay settled: a relay that Ergo has not answered holds the answer", async () => {
    let settle: (took: Relayed) => void = () => undefined;
    const relay = vi.fn(() => new Promise<Relayed>((resolve) => (settle = resolve)));
    const { app } = setup({ relay });
    const guest = await arrive(app);
    let done = false;
    const pending = Promise.resolve(say(app, guest, "hi")).then((res) => {
      done = true;
      return res;
    });
    await vi.waitFor(() => {
      expect(relay).toHaveBeenCalled();
    });
    // Every microtask and I/O callback already queued has run: a route that answered would have, by now.
    for (let turn = 0; turn < 3; turn += 1) await new Promise<void>((resolve) => setImmediate(resolve));
    expect(done).toBe(false);
    settle({ msgid: "m9" });
    expect((await pending).status).toBe(200);
  });

  it("answers not_ready, cause relay, when Ergo did not take it (the bot is not in the room, the link is down), counting nothing", async () => {
    const { app, counted } = setup({ relay: () => Promise.resolve(false) });
    const guest = await arrive(app);
    const res = await say(app, guest, "hi");
    expect(await said(res)).toEqual({ status: 503, error: "not_ready", cause: "relay" });
    expect(counted).not.toHaveBeenCalled();
  });

  it("marks the guest used at each line, so a speaking guest is not purged at 24 hours", async () => {
    const { app, db, clock } = setup();
    const guest = await arrive(app);
    clock.now = T0 + 5 * HOUR;
    await say(app, guest, "hi");
    expect(db.prepare("SELECT last_seen AS l FROM guests").get()).toEqual({ l: T0 + 5 * HOUR });
  });

  it("answers 401 to no cookie, a made-up one and a purged guest's, and calls neither the provider nor the relay", async () => {
    const { app, db, relay, provider } = setup();
    const guest = await arrive(app);
    db.prepare("DELETE FROM guests").run();
    const answers = await Promise.all([
      post(app, "/say", { body: { room: "#earth", text: "hi" } }),
      post(app, "/say", { cookie: asGuest("y".repeat(43)), body: { room: "#earth", text: "hi" } }),
      say(app, guest, "hi"),
    ]);
    expect(answers.map((res) => res.status)).toEqual([401, 401, 401]);
    expect(await answers[0].json()).toEqual({ error: "unauthenticated" });
    expect(relay).not.toHaveBeenCalled();
    expect(provider).not.toHaveBeenCalled();
  });

  it("is no account's: a login session gets 403, even with a stale or living guest cookie, and nothing is relayed (an account speaks as itself)", async () => {
    const { app, relay, provider } = setup();
    const guest = await arrive(app);
    const body = { room: "#earth", text: "hi" };
    const answers = await Promise.all([
      post(app, "/say", { cookie: `${SESSION}=account-session`, body }),
      post(app, "/say", { cookie: `${SESSION}=account-session; ${guest.cookie}`, body }),
      post(app, "/say", { cookie: `${SESSION}=account-session; ${COOKIE}=${"z".repeat(43)}`, body }),
    ]);
    for (const res of answers) expect([res.status, await res.json()]).toEqual([403, { error: "forbidden" }]);
    expect(relay).not.toHaveBeenCalled();
    expect(provider).not.toHaveBeenCalled();
  });

  it("refuses a foreign Origin and a non-JSON body before it reads the cookie or the body", async () => {
    const { app, relay } = setup();
    const guest = await arrive(app);
    const body = { room: "#earth", text: "hi" };
    const answers = await Promise.all([
      post(app, "/say", { cookie: guest.cookie, body, origin: "https://evil.test" }),
      post(app, "/say", { cookie: guest.cookie, body, origin: undefined }),
      post(app, "/say", { cookie: guest.cookie, body: JSON.stringify(body), type: "text/plain" }),
    ]);
    expect(answers.map((res) => res.status)).toEqual([403, 403, 415]);
    expect(relay).not.toHaveBeenCalled();
  });

  it("takes only a room id and a text: a nick, a name, a missing field, an extra key or a wrong type is refused 400, so no direct message exists", async () => {
    const { app, relay } = setup();
    const guest = await arrive(app);
    const bodies: unknown[] = [
      { room: "alice", text: "hi" },
      { room: "gnoworld", text: "hi" },
      { room: "", text: "hi" },
      { room: "#a b", text: "hi" },
      { room: "#earth,#bubble", text: "hi" },
      { room: "#earth" },
      { text: "hi" },
      { room: "#earth", text: 3 },
      { room: ["#earth"], text: "hi" },
      { room: "#earth", text: "hi", nick: "anon/x-y-aaaa" },
      { room: "#earth", text: "hi", as: "alice" },
      [],
      "text",
    ];
    for (const body of bodies) {
      const res = await post(app, "/say", { cookie: guest.cookie, body });
      expect([res.status, JSON.stringify(body)]).toEqual([400, JSON.stringify(body)]);
    }
    expect(relay).not.toHaveBeenCalled();
  });

  it("lets a guest write in a room it may and read in one it may only read: forbidden for a read-only room, not found for any other", async () => {
    const { app, relay, provider } = setup();
    const guest = await arrive(app);
    const read = await say(app, guest, "hi", "#earth/news");
    expect([read.status, await read.json()]).toEqual([403, { error: "forbidden" }]);
    for (const room of ["#members-only", "#earth/hidden", "#unknown", "#earth/accounts-only"]) {
      const res = await say(app, guest, "hi", room);
      expect([res.status, await res.json()]).toEqual([404, { error: "not_found" }]);
    }
    expect(relay).not.toHaveBeenCalled();
    expect(provider).not.toHaveBeenCalled();
  });
});

describe("POST /api/guest/say: a guest's rules, before anything is said", () => {
  const refusals: [string, string, string][] = [
    ["a link", "see https://x.test now", "links"],
    ["two mentions", "@ada @bo hi", "mentions"],
    ["a banned word", "this is spam", "banned_word"],
    ["281 characters", "a".repeat(281), "too_long"],
    ["two lines", "one\ntwo", "multiline"],
    ["a CTCP", "\u0001ACTION waves\u0001", "control"],
    ["nothing", "   ", "empty"],
  ];

  it.each(refusals)(
    "refuses %s with refused and its cause, never relays it, never asks the provider",
    async (_what, text, cause) => {
      const { app, relay, provider, counted } = setup();
      const guest = await arrive(app);
      expect(await said(await say(app, guest, text))).toEqual({ status: 400, error: "refused", cause });
      expect(relay).not.toHaveBeenCalled();
      expect(provider).not.toHaveBeenCalled();
      expect(counted).not.toHaveBeenCalled();
    },
  );

  it("takes 280 characters, one mention and a plain line that an account would also pass", async () => {
    const { app, relay } = setup();
    const guest = await arrive(app);
    for (const text of ["a".repeat(280), "hi @ada", "plain"]) {
      expect((await say(app, guest, text, text === "plain" ? "#bubble" : "#earth")).status).toBe(200);
    }
    expect(relay).toHaveBeenCalledTimes(3);
  });

  it("is stricter than the account: a world allowing 3 links and 5 mentions still gives a guest none and one", async () => {
    const { app } = setup();
    const guest = await arrive(app);
    expect(await said(await say(app, guest, "https://a.test", "#bubble"))).toMatchObject({
      error: "refused",
      cause: "links",
    });
  });

  it("adds the roles file's default words to the world's, and judges an unlisted world by the defaults alone", async () => {
    const defaults: Rules = { bannedWords: ["scam"], linksPerMessage: 3, mentionsPerMessage: 5, linksForNewAccount: 2 };
    const { app, relay } = setup({
      defaults,
      rulesOf: (world) => (world === "earth" ? WORLD : undefined),
    });
    const guest = await arrive(app);
    expect(await said(await say(app, guest, "a scam"))).toMatchObject({ cause: "banned_word" });
    expect(await said(await say(app, guest, "spam!"))).toMatchObject({ cause: "banned_word" });
    expect(await said(await say(app, guest, "a scam", "#bubble"))).toMatchObject({ cause: "banned_word" });
    expect((await say(app, guest, "fine", "#bubble")).status).toBe(200);
    expect(relay).toHaveBeenCalledTimes(1);
  });

  it("keeps a room with no rules of its own and no defaults closed to guests: forbidden, nothing said", async () => {
    const { app, relay } = setup({ rulesOf: () => undefined });
    const guest = await arrive(app);
    const res = await say(app, guest, "hello");
    expect([res.status, await res.json()]).toEqual([403, { error: "forbidden" }]);
    expect(relay).not.toHaveBeenCalled();
  });

  it("logs a refusal's cause and never the text, the name or the cookie", async () => {
    const { app, lines } = setup();
    const guest = await arrive(app);
    await say(app, guest, "secret-text spam");
    const log = lines.join("\n");
    expect(log).toContain("banned_word");
    for (const leak of ["secret-text", guest.name, guest.cookie.split("=")[1] ?? "x", PEER])
      expect(log).not.toContain(leak);
  });
});

describe("POST /api/guest/say: the rates (plan 3.2, 3.3)", () => {
  it("refuses the 7th line a minute from a name with too_many, never reaching the provider or the relay, and serves it a minute later", async () => {
    const { app, clock, provider, relay } = setup();
    const guest = await arrive(app);
    const rooms = ["#earth", "#earth/kyoto"];
    for (let n = 0; n < 6; n += 1) expect((await say(app, guest, `line ${String(n)}`, rooms[n % 2])).status).toBe(200);
    const seven = await say(app, guest, "line 7", "#bubble");
    expect([seven.status, await seven.json()]).toEqual([429, { error: "too_many" }]);
    expect(provider).toHaveBeenCalledTimes(6);
    expect(relay).toHaveBeenCalledTimes(6);
    clock.now = T0 + MINUTE;
    expect((await say(app, guest, "later", "#bubble")).status).toBe(200);
  });

  it("refuses the 4th line a minute from a name in one room, and takes the same name in another room", async () => {
    const { app } = setup();
    const guest = await arrive(app);
    for (let n = 0; n < 3; n += 1) expect((await say(app, guest, `line ${String(n)}`)).status).toBe(200);
    expect((await say(app, guest, "four")).status).toBe(429);
    expect((await say(app, guest, "four", "#earth/kyoto")).status).toBe(200);
  });

  it("refuses the 13th line a minute from a visitor across its names: a private window takes a new name, not a new allowance", async () => {
    const { app, relay } = setup();
    const guests = [await arrive(app), await arrive(app), await arrive(app)];
    for (const guest of guests)
      for (const room of ["#earth", "#earth", "#earth/kyoto", "#earth/kyoto"])
        expect((await say(app, guest, "hi", room)).status).toBe(200);
    const [first] = guests;
    if (first === undefined) throw new Error("no guest");
    expect((await say(app, first, "13th", "#bubble")).status).toBe(429);
    expect(relay).toHaveBeenCalledTimes(12);
    const other = await arrive(app, "198.51.100.1");
    expect((await say(app, other, "elsewhere")).status).toBe(200);
  });

  it("counts a refused line in the rate, so refused lines cannot be sent without end to the rules and the provider", async () => {
    const { app, provider } = setup();
    const guest = await arrive(app);
    for (let n = 0; n < 6; n += 1) await say(app, guest, "a".repeat(300), n % 2 === 0 ? "#earth" : "#earth/kyoto");
    const res = await say(app, guest, "clean", "#bubble");
    expect(res.status).toBe(429);
    expect(provider).not.toHaveBeenCalled();
  });
});

describe("POST /api/guest/say: the provider's check, before the relay", () => {
  it("sends the provider the trimmed text alone, once, after the rules, and relays a line it passes", async () => {
    const { app, provider, relay } = setup();
    const guest = await arrive(app);
    await say(app, guest, " fine ");
    expect(provider).toHaveBeenCalledExactlyOnceWith("fine");
    expect(relay).toHaveBeenCalledTimes(1);
  });

  it("refuses a line the provider flags with refused, cause moderation, and never relays it", async () => {
    const { app, relay } = setup({ provider: () => Promise.resolve(HATE) });
    const guest = await arrive(app);
    expect(await said(await say(app, guest, "bad"))).toEqual({ status: 400, error: "refused", cause: "moderation" });
    expect(relay).not.toHaveBeenCalled();
  });

  it("applies the thresholds of the settings, as an account's check does", async () => {
    const answer: Answer = { flagged: NOTHING.flagged, scores: { ...NOTHING.scores, harassment: 0.6 } };
    const strict = setup({ provider: () => Promise.resolve(answer), thresholds: { harassment: 0.5 } });
    expect((await say(strict.app, await arrive(strict.app), "hm")).status).toBe(400);
    const loose = setup({ provider: () => Promise.resolve(answer) });
    expect((await say(loose.app, await arrive(loose.app), "hm")).status).toBe(200);
  });

  it("does not relay a line the provider could not check: fail closed, 503 not_ready, cause unchecked (the same as a room's name, D394)", async () => {
    const { app, relay } = setup({ provider: () => Promise.resolve("unchecked") });
    const guest = await arrive(app);
    expect(await said(await say(app, guest, "hi"))).toEqual({ status: 503, error: "not_ready", cause: "unchecked" });
    expect(relay).not.toHaveBeenCalled();
  });

  it("does not relay when no provider is set, or when it throws", async () => {
    const none = setup({ provider: "none" });
    expect((await say(none.app, await arrive(none.app), "hi")).status).toBe(503);
    const throws = setup({ provider: () => Promise.reject(new Error("boom")) });
    expect((await say(throws.app, await arrive(throws.app), "hi")).status).toBe(503);
    expect(none.relay).not.toHaveBeenCalled();
    expect(throws.relay).not.toHaveBeenCalled();
  });

  it.each([
    ["answers unchecked", () => Promise.resolve<Answer | "unchecked">("unchecked")],
    ["throws", () => Promise.reject(new Error("boom"))],
  ])(
    "fails closed through five failures and the breaker's pause, a provider that %s: 503 not_ready unchecked, nothing relayed",
    async (_how, failing) => {
      const provider = vi.fn(failing);
      const { app, clock, relay } = setup({ provider });
      const guest = await arrive(app);
      const rooms = ["#earth", "#earth", "#earth", "#earth/kyoto", "#earth/kyoto", "#bubble"];
      for (const room of rooms)
        expect(await said(await say(app, guest, "hi", room))).toEqual({
          status: 503,
          error: "not_ready",
          cause: "unchecked",
        });
      // Five asked the provider, the sixth met the breaker: still refused, the provider not asked.
      expect(provider).toHaveBeenCalledTimes(5);
      expect(relay).not.toHaveBeenCalled();
      clock.now = T0 + 31 * SECOND;
      const later = await arrive(app, "198.51.100.1");
      expect(await said(await say(app, later, "later", "#bubble"))).toEqual({
        status: 503,
        error: "not_ready",
        cause: "unchecked",
      });
      expect(provider).toHaveBeenCalledTimes(6);
    },
  );
});

describe("POST /api/guest/say: limits are spent before the provider's await (plan 3.3)", () => {
  const held = () => {
    const gate: { release: (answer: Answer) => void } = { release: () => undefined };
    const promise = new Promise<Answer>((resolve) => {
      gate.release = resolve;
    });
    const provider = vi.fn<ProviderFn>(() => promise);
    return { provider, gate };
  };
  const ROOMS = ["#earth", "#earth/kyoto", "#bubble"];
  // A request counted when it has its answer: the refused ones answer at once, the held ones wait for the gate.
  const counting = async (pending: Promise<Response>, done: { n: number }): Promise<Response> => {
    const res = await pending;
    done.n += 1;
    return res;
  };

  it("lets 10 lines sent at once from one guest in one room reach the provider 3 times at most, and 6 across rooms", async () => {
    const one = held();
    const room = setup({ provider: one.provider });
    const guest = await arrive(room.app);
    const done = { n: 0 };
    const sent = Promise.all(Array.from({ length: 10 }, () => counting(say(room.app, guest, "hi"), done)));
    await vi.waitFor(() => {
      expect(done.n).toBe(7);
    });
    expect(one.provider).toHaveBeenCalledTimes(3);
    one.gate.release(NOTHING);
    expect((await sent).map((res) => res.status).filter((status) => status === 200)).toHaveLength(3);

    const many = held();
    const across = setup({ provider: many.provider });
    const other = await arrive(across.app);
    const finished = { n: 0 };
    const spread = Promise.all(
      Array.from({ length: 10 }, (_, n) => counting(say(across.app, other, "hi", ROOMS[n % 3]), finished)),
    );
    await vi.waitFor(() => {
      expect(finished.n).toBe(4);
    });
    expect(many.provider).toHaveBeenCalledTimes(6);
    many.gate.release(NOTHING);
    expect((await spread).filter((res) => res.status === 429)).toHaveLength(4);
  });

  it("lets 30 lines at once from three names of one visitor reach the provider 12 times at most", async () => {
    const { provider, gate } = held();
    const { app } = setup({ provider });
    const guests = [await arrive(app), await arrive(app), await arrive(app)];
    const done = { n: 0 };
    const sent = Promise.all(
      guests.flatMap((guest) =>
        Array.from({ length: 10 }, (_, n) => counting(say(app, guest, "hi", ROOMS[n % 3]), done)),
      ),
    );
    await vi.waitFor(() => {
      expect(done.n).toBe(18);
    });
    expect(provider).toHaveBeenCalledTimes(12);
    gate.release(NOTHING);
    expect((await sent).filter((res) => res.status === 200)).toHaveLength(12);
  });
});

describe("POST /api/guest/say: the relay's word (the link bounds it itself, 5 s)", () => {
  it("sets no timer of its own: relay.ts settles itself, so the route waits on the relay alone", async () => {
    vi.useFakeTimers({ now: T0, toFake: ["setTimeout", "clearTimeout"] });
    const relay = vi.fn(() => new Promise<Relayed>(() => undefined));
    const { app } = setup({ relay });
    const guest = await arrive(app);
    const pending = say(app, guest, "hi");
    await vi.waitFor(() => {
      expect(relay).toHaveBeenCalled();
    });
    expect(vi.getTimerCount()).toBe(0);
    expect(pending).toBeInstanceOf(Promise);
  });

  it("answers 503 not_ready, cause unsure, for a relay that timed out: the line may still come, so no 'try again' that doubles it", async () => {
    const { app, counted, passed, db } = setup({ relay: () => Promise.resolve("unsure") });
    const guest = await arrive(app);
    expect(await said(await say(app, guest, "hi"))).toEqual({ status: 503, error: "not_ready", cause: "unsure" });
    expect(counted).not.toHaveBeenCalled();
    expect(passed).not.toHaveBeenCalled();
    expect(count(db, "guest_strikes")).toBe(0);
  });

  it("keeps cause relay for a real refusal: Ergo said no, the bot is not in the room", async () => {
    const { app, counted, passed } = setup({ relay: () => Promise.resolve(false) });
    const guest = await arrive(app);
    expect(await said(await say(app, guest, "hi"))).toEqual({ status: 503, error: "not_ready", cause: "relay" });
    expect(counted).not.toHaveBeenCalled();
    expect(passed).not.toHaveBeenCalled();
  });

  it("clears no timer because it sets none: nothing is left waiting once the relay answered", async () => {
    vi.useFakeTimers({ now: T0, toFake: ["setTimeout", "clearTimeout"] });
    const { app } = setup();
    const guest = await arrive(app);
    expect((await say(app, guest, "hi")).status).toBe(200);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("reads the room's world once for a line and hands it to the access and the rules, which look nothing up", async () => {
    const { app, worldOf, access, rulesSpy } = setup();
    const guest = await arrive(app);
    await say(app, guest, "hi");
    expect(worldOf).toHaveBeenCalledExactlyOnceWith("#earth");
    expect(access).toHaveBeenCalledExactlyOnceWith("#earth", "earth");
    expect(rulesSpy).toHaveBeenCalledExactlyOnceWith("earth");
  });

  it("hands the line the relay took to the recent lines, under the id Ergo gave it, as the guest's nick said it: it can be translated", async () => {
    const { app, passed } = setup({ relay: () => Promise.resolve({ msgid: "m77" }) });
    const guest = await arrive(app);
    await say(app, guest, " hello there ");
    expect(passed).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ room: "#earth", account: `anon/${guest.name}`, msgid: "m77", text: "hello there" }),
    );
  });
});

describe("POST /api/guest/say: a relay that rejects, and what keeps a guest living (D430)", () => {
  it("answers 503 not_ready relay when the relay rejects: no strike, nothing counted or passed, no text in the log", async () => {
    const { app, db, counted, passed, lines } = setup({
      relay: () => Promise.reject(new Error("link says secret-text")),
    });
    const guest = await arrive(app);
    expect(await said(await say(app, guest, "secret-text"))).toEqual({
      status: 503,
      error: "not_ready",
      cause: "relay",
    });
    expect(count(db, "guest_strikes")).toBe(0);
    expect(counted).not.toHaveBeenCalled();
    expect(passed).not.toHaveBeenCalled();
    expect(lines.join("\n")).not.toContain("secret-text");
  });

  it.each([
    ["a rule's refusal", () => ({}), "https://x.test", 400],
    ["an unsure relay", () => ({ relay: () => Promise.resolve("unsure" as const) }), "hi", 503],
    ["a refused relay", () => ({ relay: () => Promise.resolve(false as const) }), "hi", 503],
    ["the provider's refusal", () => ({ provider: () => Promise.resolve(HATE) }), "bad", 400],
  ])("leaves a guest's last use alone for %s", async (...[, options, text, status]) => {
    const { app, db, clock } = setup(options());
    const guest = await arrive(app);
    clock.now = T0 + 5 * HOUR;
    expect((await say(app, guest, text)).status).toBe(status);
    expect(db.prepare("SELECT last_seen FROM guests").get()).toEqual({ last_seen: T0 });
  });

  it("leaves it alone for a line over the rate, and marks it for the line the relay took", async () => {
    const { app, db, clock } = setup();
    const guest = await arrive(app);
    for (let n = 0; n < 3; n += 1) await say(app, guest, "hi");
    clock.now = T0 + 20 * SECOND;
    expect((await say(app, guest, "four")).status).toBe(429);
    expect(db.prepare("SELECT last_seen FROM guests").get()).toEqual({ last_seen: T0 });
    clock.now = T0 + 5 * HOUR;
    expect((await say(app, guest, "fine", "#bubble")).status).toBe(200);
    expect(db.prepare("SELECT last_seen FROM guests").get()).toEqual({ last_seen: T0 + 5 * HOUR });
  });
});

describe("a pasted tab, a zero-width line and a lone surrogate (L1, L2)", () => {
  it("turns a tab into a space before the verdict: it is relayed as typed, no strike, no mute for a household", async () => {
    const { app, relay, db } = setup();
    const guest = await arrive(app);
    expect((await say(app, guest, "col1\tcol2")).status).toBe(200);
    expect(relay).toHaveBeenCalledExactlyOnceWith("#earth", `anon/${guest.name}`, "col1 col2");
    expect(count(db, "guest_strikes")).toBe(0);
  });

  it("takes a line of tabs alone for an empty one, no strike", async () => {
    const { app, db } = setup();
    const guest = await arrive(app);
    expect(await said(await say(app, guest, "\t\t"))).toMatchObject({ status: 400, cause: "empty" });
    expect(count(db, "guest_strikes")).toBe(0);
  });

  it("refuses a lone surrogate and a zero-width line before the provider is asked, a strike for the first, none for the second", async () => {
    const { app, provider, relay, db } = setup();
    const guest = await arrive(app);
    expect(await said(await say(app, guest, "a\ud800b"))).toMatchObject({ status: 400, cause: "control" });
    expect(await said(await say(app, guest, "\u200b\u200d", "#earth/kyoto"))).toMatchObject({
      status: 400,
      cause: "empty",
    });
    expect(provider).not.toHaveBeenCalled();
    expect(relay).not.toHaveBeenCalled();
    expect(count(db, "guest_strikes")).toBe(1);
  });
});

describe("POST /api/guest/say: strikes and mutes by guest and visitor (D430)", () => {
  const strike = async (strikes: { app: App; clock: { now: number }; who: Who }, times: number) => {
    const { app, clock, who } = strikes;
    for (let n = 0; n < times; n += 1) {
      await say(app, who, "https://x.test", "#earth");
      clock.now += 25 * SECOND;
    }
  };

  it("keeps a strike for a line the rules or the provider refused, with the guest's id and its visitor's hash", async () => {
    const { app, db } = setup({ provider: () => Promise.resolve(HATE) });
    const guest = await arrive(app);
    await say(app, guest, "https://x.test");
    await say(app, guest, "bad", "#earth/kyoto");
    const rows = db.prepare("SELECT guest_id AS g, visitor_hash AS v, world, at FROM guest_strikes").all();
    const { id, v } = db.prepare("SELECT id, visitor_hash AS v FROM guests").get() as { id: number; v: string };
    expect(rows).toEqual([
      { g: id, v, world: "earth", at: T0 },
      { g: id, v, world: "earth", at: T0 },
    ]);
  });

  it("keeps no strike for a line too long, in two lines, empty, or refused for the rate: no word was broken", async () => {
    const { app, db } = setup();
    const guest = await arrive(app);
    for (const text of ["a".repeat(300), "a\nb", " "]) await say(app, guest, text);
    for (let n = 0; n < 8; n += 1) await say(app, guest, "x", "#bubble");
    expect(count(db, "guest_strikes")).toBe(0);
  });

  it("mutes the visitor in the world at the third strike in the window, never relaying its next line, clean or not", async () => {
    const { app, clock, db, relay } = setup();
    const guest = await arrive(app);
    await strike({ app, clock, who: guest }, 3);
    const res = await say(app, guest, "now clean");
    expect(await said(res)).toEqual({ status: 403, error: "forbidden", cause: "muted" });
    expect(relay).not.toHaveBeenCalled();
    expect(db.prepare("SELECT world FROM guest_mutes").all()).toEqual([{ world: "earth" }]);
  });

  it("strikes the visitor across its names: two strikes under one name and one under a new name mute both", async () => {
    const { app, clock } = setup();
    const a = await arrive(app);
    await strike({ app, clock, who: a }, 2);
    const b = await arrive(app);
    await strike({ app, clock, who: b }, 1);
    for (const guest of [a, b])
      expect((await said(await say(app, guest, "clean", "#earth/kyoto"))).cause).toBe("muted");
  });

  it("does not mute for strikes spread past the window, nor another visitor", async () => {
    const { app, clock, relay } = setup();
    const guest = await arrive(app);
    const other = await arrive(app, "198.51.100.1");
    await say(app, guest, "https://x.test");
    clock.now += 6 * MINUTE;
    await say(app, guest, "https://x.test");
    clock.now += 6 * MINUTE;
    await say(app, guest, "https://x.test");
    clock.now += 61 * SECOND;
    expect((await say(app, guest, "clean")).status).toBe(200);
    expect((await say(app, other, "clean")).status).toBe(200);
    expect(relay).toHaveBeenCalledTimes(2);
  });

  it("holds the mute for its minutes in the world it was earned in, and lets the guest speak in another world, and again after", async () => {
    const { app, clock } = setup();
    const guest = await arrive(app);
    await strike({ app, clock, who: guest }, 3);
    const mutedAt = clock.now;
    expect((await say(app, guest, "clean", "#bubble")).status).toBe(200);
    clock.now = mutedAt + 5 * MINUTE;
    expect((await say(app, guest, "clean")).status).toBe(200);
  });
});

describe("a mute's length and its window (D430)", () => {
  const strikeTwice = async (app: App, clock: { now: number }) => {
    const guest = await arrive(app);
    await say(app, guest, "https://x.test");
    clock.now += 30 * SECOND;
    await say(app, guest, "https://x.test");
    return { guest, struck: clock.now };
  };

  it("holds the mute from the last strike's time for its minutes exactly: refused 1 ms before, free at the minute", async () => {
    const { app, clock, relay } = setup({ mute: { strikes: 2, windowMinutes: 1, minutes: 2 } });
    const { guest, struck } = await strikeTwice(app, clock);
    clock.now = struck + 2 * MINUTE - 1;
    expect(await said(await say(app, guest, "clean"))).toEqual({ status: 403, error: "forbidden", cause: "muted" });
    expect(relay).not.toHaveBeenCalled();
    clock.now = struck + 2 * MINUTE;
    expect((await say(app, guest, "clean")).status).toBe(200);
  });

  it("counts strikes exactly the window apart, and not one a millisecond further", async () => {
    const edge = setup();
    const guest = await arrive(edge.app);
    for (const at of [0, 5 * MINUTE, 10 * MINUTE]) {
      edge.clock.now = T0 + at;
      await say(edge.app, guest, "https://x.test");
    }
    edge.clock.now = T0 + 10 * MINUTE + 1;
    expect((await said(await say(edge.app, guest, "clean"))).cause).toBe("muted");

    const past = setup();
    const other = await arrive(past.app);
    for (const at of [0, 5 * MINUTE, 10 * MINUTE + 1]) {
      past.clock.now = T0 + at;
      await say(past.app, other, "https://x.test");
    }
    past.clock.now = T0 + 10 * MINUTE + 2;
    expect((await say(past.app, other, "clean")).status).toBe(200);
  });
});

describe("which refusals strike, and which never do (D430)", () => {
  it.each([
    ["a banned word", "this is spam", "banned_word"],
    ["two mentions", "@a @b", "mentions"],
    ["a link", "see https://x.test", "links"],
    ["a control character", "\u0001ACTION x\u0001", "control"],
  ])("keeps one strike for %s", async (_what, text, cause) => {
    const { app, db } = setup();
    const guest = await arrive(app);
    expect(await said(await say(app, guest, text))).toMatchObject({ cause });
    expect(count(db, "guest_strikes")).toBe(1);
  });

  it("never mutes an honest guest for an outage: three unchecked lines, then a clean one is relayed", async () => {
    let down = true;
    const provider = vi.fn(() => Promise.resolve<Answer | "unchecked">(down ? "unchecked" : NOTHING));
    const { app, db, relay } = setup({ provider, mute: { strikes: 1, windowMinutes: 10, minutes: 5 } });
    const guest = await arrive(app);
    for (let n = 0; n < 3; n += 1) expect((await say(app, guest, "hi", "#earth")).status).toBe(503);
    down = false;
    expect((await say(app, guest, "hi again", "#earth/kyoto")).status).toBe(200);
    expect(count(db, "guest_strikes")).toBe(0);
    expect(relay).toHaveBeenCalledTimes(1);
  });

  it("asks the provider nothing for a muted guest, and nothing is relayed", async () => {
    const { app, provider, relay, clock } = setup();
    const guest = await arrive(app);
    for (let n = 0; n < 3; n += 1) {
      await say(app, guest, "https://x.test");
      clock.now += 25 * SECOND;
    }
    const asked = provider.mock.calls.length;
    await say(app, guest, "clean");
    expect(provider.mock.calls).toHaveLength(asked);
    expect(relay).not.toHaveBeenCalled();
  });
});

describe("what the routes never leak or take", () => {
  const SECRET = "leak-me-text";

  it("writes no line's text, name, cookie value, address or Set-Cookie into the log, whatever way a request ends", async () => {
    const { app, lines, clock } = setup({
      provider: (text) => Promise.reject(new Error(`provider failed on ${text}`)),
      guests: { perVisitor: 3 },
    });
    const seen: string[] = [];
    const first = await post(app, "");
    seen.push(tokenOf(first), Named.parse(await first.json()).name);
    const guest = { cookie: asGuest(tokenOf(first)), peer: PEER };
    // A request each of 429 (new names), unchecked (the provider's error holds the text), a rule's refusal, then a mute.
    await post(app, "");
    await post(app, "");
    await post(app, "");
    await say(app, guest, SECRET);
    await say(app, guest, `${SECRET} https://x.test`, "#earth/kyoto");
    for (let n = 0; n < 3; n += 1) {
      await say(app, guest, `${SECRET} spam`, "#bubble");
      clock.now += 25 * SECOND;
    }
    await say(app, guest, SECRET, "#bubble");
    const log = lines.join("\n");
    for (const leak of [SECRET, ...seen, PEER, "set-cookie", "Set-Cookie"]) expect(log).not.toContain(leak);
    expect(lines.length).toBeGreaterThan(5);
  });

  it("logs a relay failure and a muted refusal with no text either", async () => {
    const { app, lines } = setup({ relay: () => Promise.resolve(false) });
    const guest = await arrive(app);
    await say(app, guest, SECRET);
    expect(lines.join("\n")).not.toContain(SECRET);
    expect(lines.join("\n")).toContain("relay");
  });

  it("refuses a body of a megabyte on both routes before any work: no row, no provider, no relay", async () => {
    const { app, db, provider, relay } = setup();
    const guest = await arrive(app);
    const big = JSON.stringify({ room: "#earth", text: "a".repeat(1_000_000) });
    const [on, say_] = await Promise.all([
      post(app, "", { body: JSON.stringify({ pad: "a".repeat(1_000_000) }) }),
      post(app, "/say", { body: big, cookie: guest.cookie }),
    ]);
    expect([on.status, say_.status]).toEqual([413, 413]);
    expect(count(db, "guests")).toBe(1);
    expect(provider).not.toHaveBeenCalled();
    expect(relay).not.toHaveBeenCalled();
  });

  it("refuses a room spelt in capitals: #EARTH is no room, and is refused before any work", async () => {
    const { app, relay, provider } = setup();
    const guest = await arrive(app);
    for (const room of ["#EARTH", "#Earth/kyoto"]) expect((await say(app, guest, "hi", room)).status).toBe(400);
    expect(relay).not.toHaveBeenCalled();
    expect(provider).not.toHaveBeenCalled();
  });

  it("answers 503 not_ready, with no cookie and no row, when the draw only gives names living guests hold", async () => {
    const fixed = Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8]);
    let n = 0;
    const random = (bytes: number): Uint8Array =>
      bytes === GUEST_NAME_BYTES ? fixed : Uint8Array.from({ length: bytes }, (_, i) => (n += i + 1) & 255);
    const { app, db } = setup({ random });
    expect((await post(app, "")).status).toBe(200);
    const res = await post(app, "", { peer: "198.51.100.1" });
    expect([res.status, await res.json()]).toEqual([503, { error: "not_ready" }]);
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(count(db, "guests")).toBe(1);
  });
});

describe("POST /api/guest: no one person takes every name (M1)", () => {
  const sibling = (n: number): string => `2001:db8:1:${n.toString(16)}::1`;

  it("gives the 60 /64s of one /48 at most 40 names an hour, 4 times the per-visitor cap, and serves another /48", async () => {
    const { app, db } = setup();
    const statuses: number[] = [];
    for (let n = 0; n < 60; n += 1) statuses.push((await post(app, "", { peer: sibling(n) })).status);
    expect(statuses.filter((status) => status === 200)).toHaveLength(40);
    expect(statuses.filter((status) => status === 429)).toHaveLength(20);
    expect(count(db, "guests")).toBe(40);
    expect((await post(app, "", { peer: "2001:db8:2::1" })).status).toBe(200);
  });

  it("takes the /48's cap as 4 times whatever the per-visitor cap is", async () => {
    const { app } = setup({ guests: { perVisitor: 1 } });
    const statuses: number[] = [];
    for (let n = 0; n < 8; n += 1) statuses.push((await post(app, "", { peer: sibling(n) })).status);
    expect(statuses).toEqual([200, 200, 200, 200, 429, 429, 429, 429]);
  });

  it("frees the /48 an hour after its window began", async () => {
    const { app, clock } = setup({ guests: { perVisitor: 1 } });
    for (let n = 0; n < 5; n += 1) await post(app, "", { peer: sibling(n) });
    clock.now = T0 + HOUR;
    expect((await post(app, "", { peer: sibling(9) })).status).toBe(200);
  });

  it("keys an IPv4 visitor as itself: its own cap of 10, never a shared bucket with another address", async () => {
    const { app } = setup();
    for (let n = 0; n < 10; n += 1) expect((await post(app, "")).status).toBe(200);
    expect((await post(app, "")).status).toBe(429);
    expect((await post(app, "", { peer: "203.0.113.8" })).status).toBe(200);
  });

  it("does not refresh a guest's last use when its cookie is shown again at POST /api/guest: only a line does", async () => {
    const { app, db, clock } = setup();
    const guest = await arrive(app);
    clock.now = T0 + 5 * HOUR;
    expect((await post(app, "", { cookie: guest.cookie })).status).toBe(200);
    expect(db.prepare("SELECT last_seen FROM guests").get()).toEqual({ last_seen: T0 });
    await say(app, guest, "hi");
    expect(db.prepare("SELECT last_seen FROM guests").get()).toEqual({ last_seen: T0 + 5 * HOUR });
  });

  it("gives no new name to a muted visitor's sibling /64 while the mute lives, and serves another /48", async () => {
    const { app, clock } = setup();
    const guest = await arrive(app, sibling(1));
    for (let n = 0; n < 3; n += 1) {
      await say(app, guest, "https://x.test", "#earth");
      clock.now += 25 * SECOND;
    }
    const refused = await post(app, "", { peer: sibling(2) });
    expect([refused.status, await refused.json()]).toEqual([403, { error: "forbidden", cause: "muted" }]);
    expect((await post(app, "", { peer: "2001:db8:2::1" })).status).toBe(200);
    clock.now += 5 * MINUTE;
    expect((await post(app, "", { peer: sibling(2) })).status).toBe(200);
  });
});

describe("POST /api/guest: living guests are those used within the hour, and a refused try spends nothing (M2)", () => {
  const other = (n: number): string => `198.51.100.${String(n)}`;

  it("lets names come an hour after 5,000-style caps filled: names made at once are living for an hour and no longer", async () => {
    const { app, clock } = setup({ guests: { living: 3 } });
    for (const n of [1, 2, 3]) expect((await post(app, "", { peer: other(n) })).status).toBe(200);
    expect((await post(app, "", { peer: other(9) })).status).toBe(429);
    clock.now = T0 + HOUR - 1;
    expect((await post(app, "", { peer: other(9) })).status).toBe(429);
    clock.now = T0 + HOUR;
    expect((await post(app, "", { peer: other(9) })).status).toBe(200);
  });

  it("keeps a guest living for an hour after its last line, and lets the cookie alone keep it nothing", async () => {
    const { app, clock } = setup({ guests: { living: 1 } });
    const guest = await arrive(app, other(1));
    clock.now = T0 + 30 * MINUTE;
    await say(app, guest, "hi");
    clock.now = T0 + 45 * MINUTE;
    await post(app, "", { cookie: guest.cookie, peer: other(1) });
    clock.now = T0 + HOUR + 1;
    expect((await post(app, "", { peer: other(2) })).status).toBe(429);
    clock.now = T0 + 90 * MINUTE;
    expect((await post(app, "", { peer: other(2) })).status).toBe(200);
  });

  it("spends no per-visitor allowance on a try refused at a full cap: refused at minute 10 and 20, served at 61", async () => {
    const { app, clock } = setup({ guests: { living: 1, perVisitor: 2 } });
    expect((await post(app, "", { peer: other(1) })).status).toBe(200);
    for (const minutes of [10, 20]) {
      clock.now = T0 + minutes * MINUTE;
      expect((await post(app, "", { peer: other(2) })).status).toBe(429);
    }
    clock.now = T0 + 61 * MINUTE;
    expect((await post(app, "", { peer: other(2) })).status).toBe(200);
  });

  it("spends nothing of the /48 or the hour's total on a try the per-visitor cap refused", async () => {
    const { app } = setup({ guests: { perVisitor: 1, perHour: 2 } });
    expect((await post(app, "", { peer: "2001:db8:1:1::1" })).status).toBe(200);
    for (let n = 0; n < 5; n += 1) expect((await post(app, "", { peer: "2001:db8:1:1::1" })).status).toBe(429);
    expect((await post(app, "", { peer: "2001:db8:1:2::1" })).status).toBe(200);
    expect((await post(app, "", { peer: "2001:db8:1:3::1" })).status).toBe(429);
  });
});

describe("the buckets behind the web proxy: every visitor shares its address, the header names the visitor (M1)", () => {
  const viaProxy = (app: App, header: string) => post(app, "", { peer: PROXY, headers: { "x-real-ip": header } });

  it("keys five distinct IPv4 visitors behind the proxy each by its own header: all served", async () => {
    const { app } = setup({ guests: { perVisitor: 1 } });
    for (const n of [1, 2, 3, 4, 5]) expect((await viaProxy(app, `198.51.100.${String(n)}`)).status).toBe(200);
    expect((await viaProxy(app, "198.51.100.1")).status).toBe(429);
  });

  it("holds six IPv6 siblings of one /48 behind the proxy to four names: the 5th is 429, another /48 is served", async () => {
    const { app } = setup({ guests: { perVisitor: 1 } });
    const statuses: number[] = [];
    for (let n = 0; n < 6; n += 1) statuses.push((await viaProxy(app, `2001:db8:1:${String(n)}::1`)).status);
    expect(statuses).toEqual([200, 200, 200, 200, 429, 429]);
    expect((await viaProxy(app, "2001:db8:2::1")).status).toBe(200);
  });

  it("gives a peer that is not the proxy its own key, whatever x-real-ip it forges", async () => {
    const { app } = setup({ guests: { perVisitor: 1 } });
    const forged = (header: string) => post(app, "", { peer: "203.0.113.50", headers: { "x-real-ip": header } });
    expect((await forged("198.51.100.1")).status).toBe(200);
    expect((await forged("198.51.100.2")).status).toBe(429);
    expect((await post(app, "", { peer: "203.0.113.51", headers: { "x-real-ip": "198.51.100.1" } })).status).toBe(200);
  });
});

describe("a refused try spends nothing, of the /48 or the hour's total (M2)", () => {
  const sibling = (n: number): string => `2001:db8:1:${n.toString(16)}::1`;

  it("does not burn the hour's total on a try the /48 refused: 4 siblings served, 10 more refused, another /48 still served", async () => {
    const { app } = setup({ guests: { perVisitor: 1, perHour: 5 } });
    for (let n = 0; n < 4; n += 1) expect((await post(app, "", { peer: sibling(n) })).status).toBe(200);
    for (let n = 4; n < 14; n += 1) expect((await post(app, "", { peer: sibling(n) })).status).toBe(429);
    expect((await post(app, "", { peer: "2001:db8:2::1" })).status).toBe(200);
    expect((await post(app, "", { peer: "2001:db8:3::1" })).status).toBe(429);
  });

  it("does not burn the /48 on a try refused at the living cap: refused at minute 10 four times, a sibling served at 61", async () => {
    const { app, clock } = setup({ guests: { living: 1, perVisitor: 1 } });
    expect((await post(app, "", { peer: "2001:db8:9::1" })).status).toBe(200);
    clock.now = T0 + 10 * MINUTE;
    for (let n = 0; n < 4; n += 1) expect((await post(app, "", { peer: sibling(n) })).status).toBe(429);
    clock.now = T0 + 61 * MINUTE;
    expect((await post(app, "", { peer: sibling(4) })).status).toBe(200);
  });
});

describe("strikes and mutes key on the /48 (D430)", () => {
  const sibling = (n: number): string => `2001:db8:1:${n.toString(16)}::1`;
  const strikes = async (...[app, clock, who, times]: [App, { now: number }, Who, number]) => {
    for (let n = 0; n < times; n += 1) {
      await say(app, who, "https://x.test", "#earth");
      clock.now += 25 * SECOND;
    }
  };

  it("mutes the /48 on 2 strikes in each of 2 sibling /64s: the strikes add up across the customer's /64s", async () => {
    const { app, clock, db } = setup();
    const [a, b] = [await arrive(app, sibling(1)), await arrive(app, sibling(2))];
    await strikes(app, clock, a, 2);
    await strikes(app, clock, b, 2);
    expect((await said(await say(app, a, "clean", "#earth/kyoto"))).cause).toBe("muted");
    expect((await said(await say(app, b, "clean", "#earth/kyoto"))).cause).toBe("muted");
    expect(db.prepare("SELECT count(DISTINCT visitor_hash) AS n FROM guest_mutes").get()).toEqual({ n: 1 });
  });

  it("keeps a guest minted in a sibling /64 before the mute from speaking: its allowance is the /48's", async () => {
    const { app, clock } = setup();
    const early = await arrive(app, sibling(5));
    const struck = await arrive(app, sibling(1));
    await strikes(app, clock, struck, 3);
    expect(await said(await say(app, early, "hello", "#bubble"))).toMatchObject({ status: 200 });
    expect((await said(await say(app, early, "hello again", "#earth/kyoto"))).cause).toBe("muted");
  });

  it("leaves another /48 and a lone IPv4 visitor free", async () => {
    const { app, clock } = setup();
    const struck = await arrive(app, sibling(1));
    const other = await arrive(app, "2001:db8:2::1");
    const v4 = await arrive(app, "203.0.113.9");
    await strikes(app, clock, struck, 3);
    clock.now += SECOND;
    expect((await say(app, other, "hi", "#earth/kyoto")).status).toBe(200);
    expect((await say(app, v4, "hi", "#bubble")).status).toBe(200);
  });
});
