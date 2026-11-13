import { createHash } from "node:crypto";
import { Address, LineCards, LinkCard } from "@gnoworld/schemas";
import { logger } from "@gnoworld/service/log";
import { describe, expect, it, vi } from "vitest";
import { BODY_LIMIT, makeApp } from "../app.ts";
import type { Right } from "../roles/mayModerate.ts";
import { cardsRoutes } from "./routes.ts";

// L3 (docs/plans/link-previews.md §3 step 5 and 6, §4 "Removal abuse", "Links acting on a GET"): GET /api/cards, GET /api/cards/<key>,
// GET /api/cards/<key>/picture, POST /api/cards/remove. No GET ever fetches: the routes hold no reader at all.
const ORIGIN = "https://gnoworld.test";
const T0 = Date.parse("2026-11-11T12:00:00.000Z");
const ALICE = Address.parse("g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv");
const MOD = Address.parse("g1m68zzc430znqyxzv6jsfz45hgccacx3mk6qajw");
const OWNER = Address.parse("g1zgldsmn6ck6w4p325xd3j8y779ky6fpjnz3uh9");
const BOB = Address.parse("g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5");
const TOKENS = new Map([
  ["alice", ALICE],
  ["mod", MOD],
  ["owner", OWNER],
  ["bob", BOB],
]);
const KEY = createHash("sha256").update("https://example.com/a").digest("hex");
const OTHER = createHash("sha256").update("https://example.com/b").digest("hex");
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1]);
const CARD: { -readonly [K in keyof LinkCard]: LinkCard[K] } = {
  host: "example.com",
  site: "Example",
  title: "A title",
  description: "A description",
  picture: { width: 160, height: 90 },
};

function setup({
  pin = (room: string, who: string): Promise<Right | false> =>
    Promise.resolve(
      who === MOD && room.startsWith("#bubble")
        ? ({ as: "staff" } as const)
        : who === OWNER
          ? ({ as: "owner", owner: OWNER } as const)
          : false,
    ),
} = {}) {
  // msgid -> its line: its room, its key, its author, and whether it is removed.
  const held = new Map<string, { room: string; key: string; author: string; removed: boolean }>([
    ["m1", { room: "#bubble", key: KEY, author: ALICE, removed: false }],
    ["m2", { room: "#bubble", key: KEY, author: BOB, removed: false }],
    ["secret", { room: "#bubble/crew", key: OTHER, author: ALICE, removed: false }],
  ]);
  const calls: string[] = [];
  const cards = {
    lines: (room: string, ids: readonly string[]) =>
      ids.flatMap((msgid) => {
        const line = held.get(msgid);
        return line?.room === room && !line.removed ? [{ msgid, key: line.key }] : [];
      }),
    content: (key: string): LinkCard | undefined =>
      [...held.values()].some((l) => l.key === key && !l.removed) && key === KEY ? CARD : undefined,
    picture: (key: string): Uint8Array | undefined => (cards.content(key) === undefined ? undefined : JPEG),
    known: (room: string, msgid: string) => held.get(msgid)?.room === room && held.get(msgid)?.removed === false,
    isAuthor: (room: string, msgid: string, who: string) =>
      held.get(msgid)?.room === room && held.get(msgid)?.author === who,
    remove: (room: string, msgid: string) => {
      calls.push(`remove ${room} ${msgid}`);
      const line = held.get(msgid);
      if (line?.room !== room || line.removed) return false;
      line.removed = true;
      return true;
    },
  };
  const lines: string[] = [];
  const log = logger("a-pepper-of-forty-characters-0123456789", (line) => lines.push(line));
  const clock = { now: T0 };
  const app = makeApp(log, () => true);
  app.route(
    "/api/cards",
    cardsRoutes({
      cards,
      mayPin: (room, who, visitor) => {
        calls.push(`mayPin ${room} ${who} ${visitor}`);
        return pin(room, who);
      },
      readable: (room, who) => room !== "#bubble/crew" || who === ALICE,
      session: (token) => TOKENS.get(token ?? ""),
      origins: [ORIGIN],
      log,
      now: () => clock.now,
    }),
  );
  interface Ask {
    who?: string;
    peer?: string;
    origin?: string | null;
    type?: string | null;
    body?: unknown;
    headers?: Record<string, string>;
  }
  const headersOf = (method: string, more: Ask): Record<string, string> => ({
    ...(more.origin === null ? {} : { origin: more.origin ?? ORIGIN }),
    ...(method === "GET" || more.type === null ? {} : { "content-type": more.type ?? "application/json" }),
    ...(more.who === undefined ? {} : { cookie: `__Host-session=${more.who}` }),
    ...more.headers,
  });
  const ask = (method: string, path: string, more: Ask = {}) =>
    app.request(
      `/api/cards${path}`,
      {
        method,
        headers: headersOf(method, more),
        ...(more.body === undefined
          ? {}
          : { body: typeof more.body === "string" ? more.body : JSON.stringify(more.body) }),
      },
      { incoming: { socket: { remoteAddress: more.peer ?? "203.0.113.7" } } },
    );
  return {
    held,
    drop: (msgid: string): void => {
      const line = held.get(msgid);
      if (line !== undefined) line.removed = true;
    },
    calls,
    clock,
    ask,
    lines: (room: string, ids: string, who?: string) =>
      ask("GET", `?room=${encodeURIComponent(room)}&ids=${ids}`, who === undefined ? {} : { who }),
    remove: (body: unknown, more: Ask = {}) => ask("POST", "/remove", { body, ...more }),
    events: () => lines.map((line) => line.replace(/^\{"time":"[^"]+",/, "{")),
  };
}
const refusal = async (response: Response) => [response.status, await response.json()];

describe("GET /api/cards?room=&ids=: the cards of lines older than the stream's replay", () => {
  it("answers each line that holds a card with its key, and leaves out a line with none, a removed one and another room's", async () => {
    const t = setup();
    t.drop("m2");
    const response = await t.lines("#bubble", "m1,m2,m3,secret");
    expect(response.status).toBe(200);
    expect(LineCards.parse(await response.json())).toEqual({ room: "#bubble", cards: [{ msgid: "m1", key: KEY }] });
  });

  it("is answered to a guest in a room anyone reads, and refuses a room the reader may not read, as the verdicts do", async () => {
    const t = setup();
    expect((await t.lines("#bubble", "m1")).status).toBe(200);
    expect(await refusal(await t.lines("#bubble/crew", "secret"))).toEqual([403, { error: "forbidden" }]);
    expect(await refusal(await t.lines("#bubble/crew", "secret", "bob"))).toEqual([403, { error: "forbidden" }]);
    expect((await t.lines("#bubble/crew", "secret", "alice")).status).toBe(200);
  });

  it("refuses no ids, more than 100 ids, an id with a space and no room", async () => {
    const t = setup();
    expect((await t.lines("#bubble", "")).status).toBe(400);
    expect((await t.lines("#bubble", Array.from({ length: 101 }, (_, i) => `m${String(i)}`).join(","))).status).toBe(
      400,
    );
    expect((await t.lines("#bubble", "m 1")).status).toBe(400);
    expect((await t.ask("GET", "?ids=m1")).status).toBe(400);
  });

  it("limits a visitor to 60 requests a minute, and starts again the minute after", async () => {
    const t = setup();
    for (let n = 0; n < 60; n += 1) expect((await t.lines("#bubble", "m1")).status).toBe(200);
    expect(await refusal(await t.lines("#bubble", "m1"))).toEqual([429, { error: "too_many" }]);
    expect((await t.ask("GET", `?room=%23bubble&ids=m1`, { peer: "203.0.113.8" })).status).toBe(200);
    t.clock.now += 61_000;
    expect((await t.lines("#bubble", "m1")).status).toBe(200);
  });

  it("answers no-store, since a card comes and goes with its line", async () => {
    expect((await setup().lines("#bubble", "m1")).headers.get("cache-control")).toBe("no-store");
  });
});

describe("GET /api/cards/<key>: a card's content, never fetched", () => {
  it("serves the card of a key some passed line holds, with no-cache and an ETag, and never a link of its own", async () => {
    const response = await setup().ask("GET", `/${KEY}`);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-cache");
    expect(response.headers.get("etag")).toMatch(/^"[^"]+"$/);
    expect(LinkCard.parse(await response.json())).toEqual(CARD);
  });

  it("gives an ETag of 32 hex digits: a short tag, never the whole hash", async () => {
    expect((await setup().ask("GET", `/${KEY}`)).headers.get("etag")).toMatch(/^"[0-9a-f]{32}"$/);
  });

  it("answers 304 to the ETag it gave, and a new body to another", async () => {
    const t = setup();
    const etag = (await t.ask("GET", `/${KEY}`)).headers.get("etag") ?? "";
    const again = await t.ask("GET", `/${KEY}`, { headers: { "if-none-match": etag } });
    expect(again.status).toBe(304);
    expect((await t.ask("GET", `/${KEY}`, { headers: { "if-none-match": '"other"' } })).status).toBe(200);
  });

  it("answers 404 for a key with no passed card (unchecked, failed, hidden, removed, unknown), saying nothing of which", async () => {
    const t = setup();
    t.drop("m1");
    t.drop("m2");
    expect(await refusal(await t.ask("GET", `/${KEY}`))).toEqual([404, { error: "not_found" }]);
    expect(await refusal(await t.ask("GET", `/${OTHER}`))).toEqual([404, { error: "not_found" }]);
  });

  it.each(["abc", "A".repeat(64), "a".repeat(63), "a".repeat(65), "../../etc/passwd", `${KEY}%00`])(
    "refuses the key %j, which is not 64 lower-case hex",
    async (key) => {
      const response = await setup().ask("GET", `/${key}`);
      expect([400, 404]).toContain(response.status);
    },
  );

  it("limits a visitor's card and picture reads to 600 a minute together, ten times the lines' route: a page of 30 cards needs 60", async () => {
    const t = setup();
    for (let n = 0; n < 300; n += 1) {
      expect((await t.ask("GET", `/${KEY}`)).status).toBe(200);
      expect((await t.ask("GET", `/${KEY}/picture`)).status).toBe(200);
    }
    expect((await t.ask("GET", `/${KEY}`)).status).toBe(429);
    expect((await t.ask("GET", `/${KEY}/picture`)).status).toBe(429);
    expect((await t.lines("#bubble", "m1")).status).toBe(200);
  });
});

describe("GET /api/cards/<key>/picture", () => {
  it("serves the card's JPEG with its type, nosniff and a cache that keeps it private to the reader", async () => {
    const response = await setup().ask("GET", `/${KEY}/picture`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/jpeg");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(JPEG);
  });

  it("answers 404 for a card that is not served, and for a card with no picture", async () => {
    const t = setup();
    expect((await t.ask("GET", `/${OTHER}/picture`)).status).toBe(404);
    t.drop("m1");
    t.drop("m2");
    expect((await t.ask("GET", `/${KEY}/picture`)).status).toBe(404);
  });
});

describe("POST /api/cards/remove", () => {
  it("lets a line's author remove its card, answering the new state, and logs it", async () => {
    const t = setup();
    const response = await t.remove({ room: "#bubble", msgid: "m1" }, { who: "alice" });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ room: "#bubble", msgid: "m1", key: null });
    expect(t.calls).toContain("remove #bubble m1");
    expect(t.events().some((line) => line.includes('"card_removed"'))).toBe(true);
    expect(t.events().join("")).not.toContain(ALICE);
  });

  it("lets the room's moderators remove another's card, and the owner of its namespace, naming what gave the right", async () => {
    for (const who of ["mod", "owner"]) {
      const t = setup();
      expect((await t.remove({ room: "#bubble", msgid: "m1" }, { who })).status, who).toBe(200);
      expect(t.held.get("m1")?.removed).toBe(true);
      expect(t.held.get("m2")?.removed).toBe(false);
    }
  });

  it("refuses another account that is neither the author nor a moderator with 403, and changes nothing", async () => {
    const t = setup();
    expect(await refusal(await t.remove({ room: "#bubble", msgid: "m1" }, { who: "bob" }))).toEqual([
      403,
      { error: "forbidden" },
    ]);
    expect(t.calls.filter((call) => call.startsWith("remove"))).toEqual([]);
    expect(t.held.get("m1")?.removed).toBe(false);
  });

  it("refuses a moderator of another world", async () => {
    const t = setup();
    t.held.set("m9", { room: "#other", key: KEY, author: ALICE, removed: false });
    expect((await t.remove({ room: "#other", msgid: "m9" }, { who: "mod" })).status).toBe(403);
  });

  it("asks nothing of the chain for the line's own author: the owner's read is for others", async () => {
    const t = setup();
    await t.remove({ room: "#bubble", msgid: "m1" }, { who: "alice" });
    expect(t.calls.filter((call) => call.startsWith("mayPin"))).toEqual([]);
  });

  it("answers 401 to a guest and to an unknown session, before any work", async () => {
    const t = setup();
    expect(await refusal(await t.remove({ room: "#bubble", msgid: "m1" }))).toEqual([
      401,
      { error: "unauthenticated" },
    ]);
    expect((await t.remove({ room: "#bubble", msgid: "m1" }, { who: "nobody" })).status).toBe(401);
    expect(t.calls).toEqual([]);
  });

  it("answers 403 for an Origin that is not listed or absent, 415 for a body that is not JSON, 400 for a bad body, before any work", async () => {
    const t = setup();
    const body = { room: "#bubble", msgid: "m1" };
    expect((await t.remove(body, { who: "alice", origin: "https://evil.example" })).status).toBe(403);
    expect((await t.remove(body, { who: "alice", origin: null })).status).toBe(403);
    expect((await t.remove(body, { who: "alice", type: "text/plain" })).status).toBe(415);
    expect((await t.remove("not json", { who: "alice" })).status).toBe(400);
    expect((await t.remove({ room: "#bubble" }, { who: "alice" })).status).toBe(400);
    expect((await t.remove({ ...body, key: KEY }, { who: "alice" })).status).toBe(400);
    expect(t.calls).toEqual([]);
  });

  it("answers 404 for a line with no card, a line already removed and a line of another room", async () => {
    const t = setup();
    expect(await refusal(await t.remove({ room: "#bubble", msgid: "nothing" }, { who: "alice" }))).toEqual([
      404,
      { error: "not_found" },
    ]);
    expect((await t.remove({ room: "#elsewhere", msgid: "m1" }, { who: "alice" })).status).toBe(404);
    expect((await t.remove({ room: "#bubble", msgid: "m1" }, { who: "alice" })).status).toBe(200);
    expect((await t.remove({ room: "#bubble", msgid: "m1" }, { who: "alice" })).status).toBe(404);
  });

  it("limits an account to 30 requests a minute: the 31st is 429, before any work", async () => {
    const t = setup();
    for (let n = 0; n < 30; n += 1)
      expect((await t.remove({ room: "#bubble", msgid: "nothing" }, { who: "alice" })).status).toBe(404);
    const before = t.calls.length;
    expect(await refusal(await t.remove({ room: "#bubble", msgid: "m1" }, { who: "alice" }))).toEqual([
      429,
      { error: "too_many" },
    ]);
    expect(t.calls.length).toBe(before);
    expect(t.held.get("m1")?.removed).toBe(false);
    t.clock.now += 61_000;
    expect((await t.remove({ room: "#bubble", msgid: "m1" }, { who: "alice" })).status).toBe(200);
  });

  it("refuses a body past the app's limit before the route reads it", async () => {
    const t = setup();
    const response = await t.remove({ room: "#bubble", msgid: "m".repeat(BODY_LIMIT) }, { who: "alice" });
    expect([400, 413]).toContain(response.status);
  });

  it("never says what the database or the owner's read said when one fails", async () => {
    const t = setup({ pin: () => Promise.reject(new Error("the chain said: secret text")) });
    const response = await t.remove({ room: "#bubble", msgid: "m1" }, { who: "bob" });
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(await response.text()).not.toContain("secret text");
  });
});

describe("caches, ETags and bounds", () => {
  it("serves the picture with no-cache and an ETag, never public, and 304 to its own tag", async () => {
    const t = setup();
    const first = await t.ask("GET", `/${KEY}/picture`);
    expect(first.headers.get("cache-control")).toBe("no-cache");
    const etag = first.headers.get("etag") ?? "";
    expect(etag).toMatch(/^"[^"]+"$/);
    expect((await t.ask("GET", `/${KEY}/picture`, { headers: { "if-none-match": etag } })).status).toBe(304);
  });

  it("changes the content's ETag with the content, and answers 404, not 304, to the old tag of a removed card", async () => {
    const t = setup();
    const etag = (await t.ask("GET", `/${KEY}`)).headers.get("etag") ?? "";
    CARD.title = "Another title";
    expect((await t.ask("GET", `/${KEY}`)).headers.get("etag")).not.toBe(etag);
    CARD.title = "A title";
    t.drop("m1");
    t.drop("m2");
    expect((await t.ask("GET", `/${KEY}`, { headers: { "if-none-match": etag } })).status).toBe(404);
    expect((await t.ask("GET", `/${KEY}/picture`)).status).toBe(404);
  });

  it("counts a visitor by the peer, never by an X-Forwarded-For header without a trusted proxy", async () => {
    const t = setup();
    for (let n = 0; n < 60; n += 1)
      await t.ask("GET", `?room=%23bubble&ids=m1`, {
        headers: { "x-forwarded-for": `198.51.100.${String(n)}`, "x-real-ip": `198.51.100.${String(n)}` },
      });
    expect(
      (await t.ask("GET", `?room=%23bubble&ids=m1`, { headers: { "x-forwarded-for": "198.51.100.200" } })).status,
    ).toBe(429);
  });

  it("refuses an invalid room with 400", async () => {
    expect((await setup().ask("GET", "?room=bubble&ids=m1")).status).toBe(400);
  });

  it("stops asking the right after 30 removals by another account: the 31st is 429 and the pin read is not asked", async () => {
    const t = setup({ pin: () => Promise.resolve(false) });
    for (let n = 0; n < 30; n += 1)
      expect((await t.remove({ room: "#bubble", msgid: "m1" }, { who: "bob" })).status).toBe(403);
    const asked = t.calls.filter((call) => call.startsWith("mayPin")).length;
    expect((await t.remove({ room: "#bubble", msgid: "m1" }, { who: "bob" })).status).toBe(429);
    expect(t.calls.filter((call) => call.startsWith("mayPin")).length).toBe(asked);
  });

  it("fails closed, in bounded time, when the pin read hangs", async () => {
    vi.useFakeTimers();
    try {
      const t = setup({ pin: () => new Promise(() => undefined) });
      const answer = t.remove({ room: "#bubble", msgid: "m1" }, { who: "bob" });
      await vi.advanceTimersByTimeAsync(6000);
      expect((await answer).status).toBe(403);
    } finally {
      vi.useRealTimers();
    }
  });
});
