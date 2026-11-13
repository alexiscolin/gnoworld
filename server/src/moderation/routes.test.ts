import { createHmac } from "node:crypto";
import { Address } from "@gnoworld/schemas";
import { logger } from "@gnoworld/service/log";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { wallet } from "../testing/signer.ts";
import { BODY_LIMIT, makeApp } from "../app.ts";
import type { Right } from "../roles/mayModerate.ts";
import { moderationRoutes } from "./routes.ts";

// Part 4 (docs/plans/owners-moderation.md, D13936): an owner hides a line and mutes an account in its worlds' rooms, over the bot's own
// functions (REDACT, `mutes.mute`). Each route is guarded like the pins' (Origin, JSON, session, strict body, right, 30 a minute) and logs
// the acting account, the owner and `as`. The world of a mute is read from the room, never from the body.
const ORIGIN = "https://gnoworld.test";
const T0 = Date.parse("2026-11-11T09:00:00.000Z");
const OWNER = Address.parse("g1mpkp5lm8lwpm0pym4388836d009zfe4maxlqsq");
const MOD = Address.parse("g1m68zzc430znqyxzv6jsfz45hgccacx3mk6qajw");
const ALICE = Address.parse("g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv");
const TRUSTED = wallet().address;
const MAKER = wallet().address;
const hmac = (who: string): string =>
  createHmac("sha256", "a-pepper-of-forty-characters-0123456789").update(who).digest("hex");
const TEAM = Address.parse("g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5");
const BAD = Address.parse("g1zgldsmn6ck6w4p325xd3j8y779ky6fpjnz3uh9");
const TOKENS = new Map([
  ["owner", OWNER],
  ["mod", MOD],
  ["alice", ALICE],
  ["maker", MAKER],
]);
const REALM = "#acme-feed";
const right = (room: string, who: string): Right | false => {
  if (who === MAKER && room === "#earth/mine") return { as: "maker" };
  if (who === OWNER && room.startsWith("#acme") && !room.includes("unplaced")) return { as: "owner", owner: OWNER };
  if (who === MOD || who === TEAM) return { as: "staff" };
  return false;
};

interface Options {
  mayModerate?: (room: string, who: string, visitor: string) => Promise<Right | false>;
  hidden?: boolean;
  muted?: "muted" | "already" | "full";
  // A world's rooms; the default is the one room of REALM's world.
  rooms?: Record<string, string[]>;
  // The accounts that moderate as owners, for the rooms the owner's identity holds.
  linked?: Address[];
  // What judging a target says in place of the right: a read that failed.
  judged?: "failed";
  // The identity of each account, for the target's check.
  identity?: Record<string, Address[]>;
}
function setup({
  mayModerate,
  hidden = true,
  muted = "muted",
  rooms = {},
  linked = [],
  judged,
  identity = {},
}: Options = {}) {
  const rightOf = (who: string, room: string): Right | false =>
    linked.includes(Address.parse(who)) && room.startsWith("#acme") ? { as: "owner", owner: OWNER } : right(room, who);
  const sent: string[] = [];
  const asked: string[] = [];
  const lines: string[] = [];
  const log = logger("a-pepper-of-forty-characters-0123456789", (line) => lines.push(line));
  const clock = { now: T0 };
  const app = makeApp(log, () => true);
  app.route(
    "/api/moderation",
    moderationRoutes({
      hide: (room, msgid) => {
        sent.push(`hide ${room} ${msgid}`);
        return hidden;
      },
      mute: (account, world) => {
        sent.push(`mute ${account} ${world}`);
        return muted;
      },
      roomsOf: (world) => rooms[world] ?? [`#${world}`],
      mayModerate:
        mayModerate === undefined
          ? (who, room, visitor) => {
              asked.push(`${who} ${room} ${visitor}`);
              return Promise.resolve(rightOf(who, room));
            }
          : (who, room, visitor) => mayModerate(room, who, visitor),
      judge: (who, room) => Promise.resolve(judged ?? rightOf(who, room)),
      identityOf: (who) => identity[who] ?? [Address.parse(who)],
      spared: (account) => account === TEAM || account === TRUSTED,
      session: (token) => TOKENS.get(token ?? ""),
      origins: [ORIGIN],
      proxy: undefined,
      log,
      now: () => clock.now,
    }),
  );
  interface Ask {
    who?: string;
    origin?: string | null;
    type?: string | null;
    body?: unknown;
  }
  const post = (path: "hide" | "mute", body: unknown, { who, origin = ORIGIN, type = "application/json" }: Ask = {}) =>
    app.request(
      `/api/moderation/${path}`,
      {
        method: "POST",
        headers: {
          ...(origin === null ? {} : { origin }),
          ...(type === null ? {} : { "content-type": type }),
          ...(who === undefined ? {} : { cookie: `__Host-session=${who}` }),
        },
        body: typeof body === "string" ? body : JSON.stringify(body),
      },
      { incoming: { socket: { remoteAddress: "203.0.113.7" } } },
    );
  const events = (event: string) =>
    lines
      .map((line) => z.record(z.string(), z.unknown()).parse(JSON.parse(line)))
      .filter((line) => line["event"] === event);
  return {
    sent,
    asked,
    clock,
    lines,
    events,
    hide: (body: unknown, more: Ask = {}) => post("hide", body, more),
    mute: (body: unknown, more: Ask = {}) => post("mute", body, more),
  };
}

const ROUTES = [
  ["hide", { room: REALM, msgids: ["m1"] }, "hide"],
  ["mute", { room: REALM, account: ALICE }, "mute"],
] as const;

describe.each(ROUTES)("%s: the gates, in order, before the link is asked anything", (name, good) => {
  const go = (t: ReturnType<typeof setup>, body: unknown, more?: Parameters<ReturnType<typeof setup>["hide"]>[1]) =>
    t[name](body, more);

  it.each([
    ["an Origin not listed", { who: "owner", origin: "https://evil.test" }, [403, "forbidden"]],
    ["no Origin", { who: "owner", origin: null }, [403, "forbidden"]],
    ["a body that is not JSON", { who: "owner", type: "text/plain" }, [415, "unsupported"]],
    ["no session", {}, [401, "unauthenticated"]],
    ["a reader who moderates nothing", { who: "alice" }, [403, "forbidden"]],
  ])("refuses %s", async (_, more, [status, error]) => {
    const t = setup();
    const response = await go(t, good, more);
    expect([response.status, await response.json()]).toEqual([status, { error }]);
    expect(t.sent).toEqual([]);
  });

  it("asks the right after the session and the body, never before", async () => {
    const t = setup();
    await go(t, good);
    await go(t, { ...good, extra: 1 }, { who: "owner" });
    await go(t, good, { who: "owner", origin: "https://evil.test" });
    expect(t.asked).toEqual([]);
  });

  it("refuses an owner of another namespace and the Earth's rooms, and asks Ergo nothing", async () => {
    const t = setup();
    for (const room of ["#other-feed", "#earth"]) {
      const response = await go(t, { ...good, room }, { who: "owner" });
      expect([response.status, await response.json()]).toEqual([403, { error: "forbidden" }]);
    }
    expect(t.sent).toEqual([]);
  });

  it("refuses, saying nothing of the failure, when the right cannot be computed", async () => {
    const t = setup({ mayModerate: () => Promise.reject(new Error("the chain said: secret")) });
    const response = await go(t, good, { who: "owner" });
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(JSON.stringify(await response.json())).not.toContain("secret");
    expect(t.sent).toEqual([]);
  });

  it.each([
    ["no room", { ...good, room: undefined }],
    ["a room that is no room's", { ...good, room: "acme" }],
    ["a room past Ergo's 64 characters", { ...good, room: `#${"a".repeat(64)}` }],
    ["a world named by the body", { ...good, world: "earth" }],
    ["a text of the page's own", { ...good, text: "forged" }],
    ["a body that is no JSON", "{not json"],
    ["an array", [good]],
  ])("refuses %s, nothing sent", async (_, body) => {
    const t = setup();
    const response = await go(t, body, { who: "owner" });
    expect([response.status, await response.json()]).toEqual([400, { error: "refused" }]);
    expect(t.sent).toEqual([]);
  });

  it("makes 30 requests a minute an account and refuses the 31st, a new minute starting again", async () => {
    const t = setup();
    for (let i = 0; i < 30; i += 1) expect((await go(t, good, { who: "owner" })).status).toBe(200);
    const over = await go(t, good, { who: "owner" });
    expect([over.status, await over.json()]).toEqual([429, { error: "too_many" }]);
    expect(t.sent).toHaveLength(30);
    t.clock.now += 60_000;
    expect((await go(t, good, { who: "owner" })).status).toBe(200);
  });

  it("gives the right the account, the room and the visitor's address", async () => {
    const t = setup();
    await go(t, good, { who: "owner" });
    expect(t.asked[0]).toBe(`${OWNER} ${REALM} 203.0.113.7`);
  });

  it("names no owner and no identity in its answer, and logs the acting account and the owner as hashes, `as`, the room and the target", async () => {
    const t = setup({ linked: [ALICE] });
    const act = name === "mute" ? { ...good, account: BAD } : good;
    const response = await go(t, act, { who: "alice" });
    expect(await response.json()).toEqual({ ok: true });
    const [line] = t.events(name === "hide" ? "line_hidden" : "account_muted");
    expect(line).toMatchObject({ as: "owner", room: REALM, account: hmac(ALICE), owner: hmac(OWNER) });
    expect(line?.["account"]).not.toBe(line?.["owner"]);
    if (name === "hide") expect(line).toMatchObject({ msgid: "m1" });
    else expect(line).toMatchObject({ subject: hmac(BAD) });
  });

  it("answers a body above the app's limit with 413 and echoes none of it", async () => {
    const t = setup();
    const response = await go(t, `PASTE${"x".repeat(BODY_LIMIT)}`, { who: "owner" });
    expect(response.status).toBe(413);
    expect(await response.text()).not.toContain("PASTE");
    expect(t.sent).toEqual([]);
  });

  it("logs a staff act as staff, with no owner", async () => {
    const t = setup();
    await go(t, good, { who: "mod" });
    const [line] = t.events(name === "hide" ? "line_hidden" : "account_muted");
    expect(line).toMatchObject({ as: "staff" });
    expect(line).not.toHaveProperty("owner");
  });
});

describe("hiding a line", () => {
  it("sends the line's REDACT by room and id, for the owner of the realm's namespace", async () => {
    const t = setup();
    expect((await t.hide({ room: REALM, msgids: ["m1"] }, { who: "owner" })).status).toBe(200);
    expect(t.sent).toEqual([`hide ${REALM} m1`]);
  });

  it.each([
    ["a msgid with a comma", "a,b"],
    ["a msgid with a line break and a command", "m1\r\nQUIT"],
    ["an empty msgid", ""],
    ["a msgid with a space", "m 1"],
    ["a msgid with a leading colon", ":m1"],
    ["a msgid of 129 characters", "m".repeat(129)],
  ])("refuses %s", async (_, msgid) => {
    const t = setup();
    expect((await t.hide({ room: REALM, msgids: [msgid] }, { who: "owner" })).status).toBe(400);
    expect(t.sent).toEqual([]);
  });

  it("hides the line shown and its last edit in one request: both REDACTed, one answer, one log line", async () => {
    const t = setup();
    expect((await t.hide({ room: REALM, msgids: ["m1", "m2"] }, { who: "owner" })).status).toBe(200);
    expect(t.sent).toEqual([`hide ${REALM} m1`, `hide ${REALM} m2`]);
    expect(t.events("line_hidden")).toMatchObject([{ msgid: "m1,m2" }]);
    expect(t.asked).toHaveLength(1);
  });

  it.each([
    ["no id", []],
    ["three ids", ["m1", "m2", "m3"]],
    ["the same id twice", ["m1", "m1"]],
    ["one bad id among two", ["m1", "m 2"]],
    ["a single id, not a list", "m1"],
  ])("refuses %s, nothing sent", async (_, msgids) => {
    const t = setup();
    expect((await t.hide({ room: REALM, msgids }, { who: "owner" })).status).toBe(400);
    expect(t.sent).toEqual([]);
  });

  it("refuses the old one-id body, `msgid`", async () => {
    const t = setup();
    expect((await t.hide({ room: REALM, msgid: "m1" }, { who: "owner" })).status).toBe(400);
  });

  it("says the server is not ready, and logs no hide, when the link did not send it", async () => {
    const t = setup({ hidden: false });
    const response = await t.hide({ room: REALM, msgids: ["m1"] }, { who: "owner" });
    expect([response.status, await response.json()]).toEqual([503, { error: "not_ready" }]);
    expect(t.events("line_hidden")).toEqual([]);
  });
});

describe("muting an account", () => {
  it("mutes it in the room's world, the world read from the room and never from the body", async () => {
    const t = setup();
    expect((await t.mute({ room: `${REALM}/talk-ab12`, account: ALICE }, { who: "owner" })).status).toBe(200);
    expect(t.sent).toEqual([`mute ${ALICE} acme-feed`]);
  });

  it.each([
    ["no account", { room: REALM }],
    ["an account that is no address", { room: REALM, account: "alice" }],
    ["two accounts", { room: REALM, account: [ALICE, BAD] }],
  ])("refuses %s", async (_, body) => {
    const t = setup();
    expect((await t.mute(body, { who: "owner" })).status).toBe(400);
    expect(t.sent).toEqual([]);
  });

  it("refuses to mute the team or a trusted account the bot spares, the spared list alone deciding for the trusted", async () => {
    const t = setup();
    for (const account of [TEAM, TRUSTED]) {
      const response = await t.mute({ room: REALM, account }, { who: "owner" });
      expect([response.status, await response.json()]).toEqual([403, { error: "forbidden" }]);
    }
    expect(t.sent).toEqual([]);
  });

  it("refuses to mute an account of the owner's own identity, linked or not named as the owner", async () => {
    const t = setup({ linked: [ALICE] });
    const response = await t.mute({ room: REALM, account: ALICE }, { who: "owner" });
    expect([response.status, await response.json()]).toEqual([403, { error: "forbidden" }]);
    expect(t.sent).toEqual([]);
  });

  it("never reaches beyond the owner's rooms: a hub of two namespaces refuses, one of the owner's alone mutes", async () => {
    const mixed = setup({ rooms: { "acme-feed": [REALM, "#acme-feed/x-0123456789", "#other-x-0123456789"] } });
    const refused = await mixed.mute({ room: REALM, account: ALICE }, { who: "owner" });
    expect([refused.status, await refused.json()]).toEqual([400, { error: "refused" }]);
    expect(mixed.sent).toEqual([]);
    const alone = setup({ rooms: { "acme-feed": [REALM, "#acme-feed/x-0123456789"] } });
    expect((await alone.mute({ room: REALM, account: ALICE }, { who: "owner" })).status).toBe(200);
    expect(alone.sent).toEqual([`mute ${ALICE} acme-feed`]);
  });

  it.each([
    ["an unplaced room", "#acme-feed/unplaced"],
    ["a roles-file room", "#bubble/crew"],
    ["the Earth's room", "#earth"],
  ])("refuses an owner's mute in a world that holds %s", async (_, other) => {
    const t = setup({ rooms: { "acme-feed": [REALM, other] } });
    const response = await t.mute({ room: REALM, account: ALICE }, { who: "owner" });
    expect([response.status, await response.json()]).toEqual([400, { error: "refused" }]);
    expect(t.sent).toEqual([]);
  });

  it("lets staff mute in a whole world, the roles file's moderators passing every room", async () => {
    const t = setup({ rooms: { "acme-feed": [REALM, "#other-x-0123456789"] } });
    expect((await t.mute({ room: REALM, account: ALICE }, { who: "mod" })).status).toBe(200);
  });

  it("refuses 409 full and logs no mute when the world's live mutes are full, never evicting one", async () => {
    const t = setup({ muted: "full" });
    const response = await t.mute({ room: REALM, account: ALICE }, { who: "owner" });
    expect([response.status, await response.json()]).toEqual([409, { error: "full" }]);
    expect(t.events("account_muted")).toEqual([]);
  });

  it("refuses to mute an account of the actor's own identity, with no read, even when judging the target says no right", async () => {
    const t = setup({ identity: { [OWNER]: [OWNER, BAD] } });
    const response = await t.mute({ room: REALM, account: BAD }, { who: "owner" });
    expect([response.status, await response.json()]).toEqual([403, { error: "forbidden" }]);
    expect(t.sent).toEqual([]);
  });

  it("refuses 503 not_ready to mute a target whose right could not be read (a failed or limited read), rather than guess no", async () => {
    const t = setup({ judged: "failed" });
    const response = await t.mute({ room: REALM, account: ALICE }, { who: "owner" });
    expect([response.status, await response.json()]).toEqual([503, { error: "not_ready" }]);
    expect(t.sent).toEqual([]);
  });

  it("never lets an Earth room's maker mute: its right reaches its own room, not the Earth (rights review, high)", async () => {
    const t = setup({ rooms: { earth: ["#earth/mine", "#earth/someone-elses"] } });
    const response = await t.mute({ room: "#earth/mine", account: ALICE }, { who: "maker" });
    expect([response.status, await response.json()]).toEqual([400, { error: "refused" }]);
    expect(t.sent).toEqual([]);
  });

  it("lets a maker hide a line in its own room, logged as a maker's", async () => {
    const t = setup();
    expect((await t.hide({ room: "#earth/mine", msgids: ["m1"] }, { who: "maker" })).status).toBe(200);
    expect(t.events("line_hidden")).toMatchObject([{ as: "maker" }]);
    expect(t.events("line_hidden")[0]).not.toHaveProperty("owner");
  });

  it("refuses to mute an account that moderates the room itself, a world's moderator or the owner", async () => {
    const t = setup();
    for (const account of [MOD, OWNER]) {
      const response = await t.mute({ room: REALM, account }, { who: "owner" });
      expect([response.status, await response.json()]).toEqual([403, { error: "forbidden" }]);
    }
    expect(t.sent).toEqual([]);
  });

  it("answers an account muted already as a success and logs no new mute", async () => {
    const t = setup({ muted: "already" });
    const response = await t.mute({ room: REALM, account: ALICE }, { who: "owner" });
    expect(response.status).toBe(200);
    expect(t.events("account_muted")).toEqual([]);
  });
});
