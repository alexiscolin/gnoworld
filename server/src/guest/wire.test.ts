import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { Presence } from "@gnoworld/schemas/indexer";
import { openDatabase } from "@gnoworld/service/db";
import { logger } from "@gnoworld/service/log";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeApp } from "../app.ts";
import { startChat, type Chat } from "../chat.ts";
import { migrations } from "../migrations.ts";
import type { Answer } from "../moderation/provider.ts";
import type { Rules } from "../roles/roles.ts";
import { ensureNamed } from "../rooms/rooms.ts";
import { fakeErgo, message, PASSWORD, welcome, type Peer } from "../testing/fakeErgo.ts";

// The wiring of the guest chat in the chat's start (D430): what the route is given, as the server gives it.
const ORIGIN = "https://gnoworld.test";
const PEPPER = "a-pepper-of-forty-characters-0123456789";
const RULES: Rules = { bannedWords: [], linksPerMessage: 3, mentionsPerMessage: 5, linksForNewAccount: 2 };
const NOTHING = {
  flagged: Object.fromEntries(["hate", "violence"].map((c) => [c, false])),
  scores: Object.fromEntries(["hate", "violence"].map((c) => [c, 0])),
} as unknown as Answer;
const opened: DatabaseSync[] = [];
const chats: Chat[] = [];
const folders: string[] = [];
afterEach(async () => {
  for (const chat of chats.splice(0)) await chat.stop();
  for (const db of opened.splice(0)) db.close();
  for (const dir of folders.splice(0)) rmSync(dir, { recursive: true, force: true });
});

interface Setup {
  on?: boolean;
  defaults?: Rules;
  session?: (token: string | undefined) => string | undefined;
}

const setup = async ({ on = true, defaults, session }: Setup = {}) => {
  const ergo = await fakeErgo();
  const db = openDatabase(":memory:", migrations);
  opened.push(db);
  const dir = mkdtempSync(join(tmpdir(), "gnoworld-guest-wire-"));
  folders.push(dir);
  const provider = vi.fn<(text: string) => Promise<Answer | "unchecked">>(() => Promise.resolve(NOTHING));
  const worlds = new Map([
    [
      "earth",
      {
        rules: RULES,
        groups: new Map([["crew", new Set<string>()]]),
        rooms: new Map([["#earth/crew", { type: "members" as const, readers: "crew", hidden: false }]]),
      },
    ],
  ]);
  const chat = startChat(
    db,
    {
      worlds,
      ergo: { host: "127.0.0.1", port: ergo.port, password: PASSWORD },
      moderation: {
        openaiKey: undefined,
        thresholds: {},
        newAccountHours: 24,
        mute: { strikes: 3, windowMinutes: 10, minutes: 5, max: 50 },
      },
      origins: [ORIGIN],
      guests: { on, perVisitor: 10, perHour: 600, living: 5000 },
      ...(defaults === undefined ? {} : { defaults }),
    },
    {
      log: logger(PEPPER, () => undefined),
      pepper: PEPPER,
      provider,
      presence: join(dir, "presence.json"),
      session: session ?? (() => undefined),
      reconcileMs: 3_600_000,
      sweepMs: 3_600_000,
    },
  );
  chats.push(chat);
  const log = logger(PEPPER, () => undefined);
  const app = makeApp(log, () => true);
  if (chat.guest !== undefined) app.route("/api/guest", chat.guest);
  const peer = await ergo.peer(0);
  await welcome(peer);
  const post = (path: string, body: unknown, cookie = "") =>
    app.request(
      `/api/guest${path}`,
      {
        method: "POST",
        headers: { origin: ORIGIN, "content-type": "application/json", ...(cookie === "" ? {} : { cookie }) },
        body: JSON.stringify(body),
      },
      { incoming: { socket: { remoteAddress: "203.0.113.7" } } },
    );
  const arrive = async (): Promise<string> =>
    `__Host-guest=${/__Host-guest=([^;]+)/.exec((await post("", {})).headers.get("set-cookie") ?? "")?.[1] ?? ""}`;
  return { app, chat, db, peer, post, provider, arrive };
};

// What Ergo answers a relay with: the line back, carrying the label it was sent with.
const answerRelay = async (peer: Peer, msgid = "m42"): Promise<string> => {
  const sent = await peer.next(/RELAYMSG/);
  const [, label = "", nick = ""] = /^@label=(\S+) RELAYMSG \S+ (\S+) /.exec(sent) ?? [];
  peer.say(`@label=${label};msgid=${msgid} :${nick}!~u@h PRIVMSG #earth :ok`);
  return sent;
};

describe("the guest chat as the chat starts it (D430)", () => {
  it("relays through the link's RELAYMSG as anon/<name>, asks the provider the line, and counts it on the plate, never in the accounts' pace", async () => {
    const { post, peer, provider, chat, arrive } = await setup();
    const cookie = await arrive();
    const name = (await (await post("", {}, cookie)).json()) as { name: string };
    const said = post("/say", { room: "#earth", text: "hello there" }, cookie);
    expect(await answerRelay(peer)).toMatch(
      new RegExp(`^@label=\\S+ RELAYMSG #earth anon/${name.name} :?hello there$`),
    );
    expect((await said).status).toBe(200);
    expect(provider).toHaveBeenCalledExactlyOnceWith("hello there");
    const earth = Presence.parse(chat.presenceNow?.()).worlds.find(({ world }) => world === "earth");
    expect(earth?.perHour).toBe(12);
    const activity = await (await chat.activity.request("/?worlds=earth")).json();
    expect(JSON.stringify(activity)).toContain('"perMinute":0');
  });

  it("never reaches the link for a members room or a room the server never made, and answers nothing it should not", async () => {
    const { post, peer, arrive, provider } = await setup();
    const cookie = await arrive();
    expect((await post("/say", { room: "#earth/crew", text: "hi" }, cookie)).status).toBe(404);
    expect((await post("/say", { room: "#nowhere", text: "hi" }, cookie)).status).toBe(404);
    peer.say("PING :sync");
    await peer.next(/^PONG sync$/);
    expect(peer.lines.filter((each) => each.includes("RELAYMSG"))).toEqual([]);
    expect(provider).not.toHaveBeenCalled();
  });

  it("judges a world the roles file does not list by its defaults' words, and an account's session stops both routes", async () => {
    const { post, db, arrive, peer } = await setup({
      defaults: { ...RULES, bannedWords: ["scam"] },
      session: (token) => (token === "acct" ? "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5" : undefined),
    });
    ensureNamed(db, [{ name: "#gnoswap-x", world: "gnoswap-x" }], 0);
    const cookie = await arrive();
    const res = await post("/say", { room: "#gnoswap-x", text: "a scam" }, cookie);
    expect([res.status, await res.json()]).toEqual([400, { error: "refused", cause: "banned_word" }]);
    expect((await post("", {}, "__Host-session=acct")).status).toBe(403);
    expect((await post("/say", { room: "#earth", text: "hi" }, `__Host-session=acct; ${cookie}`)).status).toBe(403);
    peer.say("PING :sync");
    await peer.next(/^PONG sync$/);
    expect(peer.lines.filter((each) => each.includes("RELAYMSG"))).toEqual([]);
  });

  it("wraps the provider in the breaker: after five failures it is not asked, and the line is refused closed", async () => {
    const { post, db, arrive, provider, peer } = await setup({ defaults: RULES });
    provider.mockImplementation(() => Promise.resolve("unchecked"));
    ensureNamed(
      db,
      [
        { name: "#gnoswap-x", world: "gnoswap-x" },
        { name: "#gnoswap-y", world: "gnoswap-y" },
      ],
      0,
    );
    const cookie = await arrive();
    const rooms = ["#earth", "#earth", "#earth", "#gnoswap-x", "#gnoswap-x", "#gnoswap-y"];
    for (const room of rooms) expect((await post("/say", { room, text: "hi" }, cookie)).status).toBe(503);
    expect(provider).toHaveBeenCalledTimes(5);
    peer.say("PING :sync");
    await peer.next(/^PONG sync$/);
    expect(peer.lines.filter((each) => each.includes("RELAYMSG"))).toEqual([]);
  });

  it("answers 404 to both routes under GUEST_CHAT=off and relays nothing", async () => {
    const { post, peer, provider } = await setup({ on: false });
    expect((await post("", {})).status).toBe(404);
    expect((await post("/say", { room: "#earth", text: "hi" }, "__Host-guest=x")).status).toBe(404);
    peer.say("PING :sync");
    await peer.next(/^PONG sync$/);
    expect(peer.lines.filter((each) => each.includes("RELAYMSG"))).toEqual([]);
    expect(provider).not.toHaveBeenCalled();
  });

  it("is mounted where the server mounts it: under /api/guest alone, a GET or another path answering 404", async () => {
    const { app } = await setup();
    const peerAddress = { incoming: { socket: { remoteAddress: "203.0.113.7" } } };
    for (const [method, path] of [
      ["GET", "/api/guest"],
      ["POST", "/api/guest/other"],
      ["POST", "/api/guests"],
      ["POST", "/guest"],
    ] as const)
      expect(
        (
          await app.request(
            path,
            {
              method,
              headers: { origin: ORIGIN, "content-type": "application/json" },
              body: method === "POST" ? "{}" : null,
            },
            peerAddress,
          )
        ).status,
      ).toBe(404);
  });

  it("counts each relayed line in its room's hour, so a room only guests speak in is never swept and shows its lines (M3)", async () => {
    const { post, peer, db, arrive } = await setup();
    const cookie = await arrive();
    for (const [text, id] of [
      ["first", "m1"],
      ["second", "m2"],
    ] as const) {
      const said = post("/say", { room: "#earth", text }, cookie);
      await answerRelay(peer, id);
      expect((await said).status).toBe(200);
    }
    const rows = db.prepare("SELECT room, hour, n FROM room_said").all() as { room: string; hour: number; n: number }[];
    expect(rows.every(({ room }) => room === "#earth")).toBe(true);
    expect(rows.reduce((sum, { n }) => sum + n, 0)).toBe(2);
    expect(rows.every(({ hour }) => Math.abs(hour - Date.now() / 3_600_000) < 2)).toBe(true);
  });

  it("writes no room_said row for a line refused before the relay", async () => {
    const { post, db, arrive } = await setup();
    const cookie = await arrive();
    await post("/say", { room: "#earth", text: "https://x.test" }, cookie);
    expect(db.prepare("SELECT count(*) AS n FROM room_said").get()).toEqual({ n: 0 });
  });

  it("lets Jarvis read a guest's relayed line: the recent lines hold it, after the provider passed it (L8)", async () => {
    const { post, peer, chat, arrive } = await setup();
    const cookie = await arrive();
    const said = post("/say", { room: "#earth", text: "hello there" }, cookie);
    await answerRelay(peer, "m77");
    expect((await said).status).toBe(200);
    expect(chat.recent("#earth", "g1asker").map(({ text }) => text)).toEqual(["hello there"]);
  });

  it("shares one provider breaker with the account check: five guest failures leave the provider alone for an account's line too (L5)", async () => {
    const { post, peer, db, arrive, provider } = await setup({ defaults: RULES });
    provider.mockImplementation(() => Promise.resolve("unchecked"));
    ensureNamed(
      db,
      [
        { name: "#gnoswap-x", world: "gnoswap-x" },
        { name: "#gnoswap-y", world: "gnoswap-y" },
      ],
      0,
    );
    const cookie = await arrive();
    const rooms = ["#earth", "#earth", "#earth", "#gnoswap-x", "#gnoswap-x"];
    for (const room of rooms) expect((await post("/say", { room, text: "hi" }, cookie)).status).toBe(503);
    expect(provider).toHaveBeenCalledTimes(5);
    peer.say(message("account=ada;msgid=acct1", "ada!u@h", ["#earth", "an account's line"]));
    await vi.waitFor(() => {
      expect(db.prepare("SELECT action FROM verdicts WHERE msgid = 'acct1'").get()).toEqual({ action: "unchecked" });
    });
    expect(provider).toHaveBeenCalledTimes(5);
  });
});
