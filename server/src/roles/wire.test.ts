import type { DatabaseSync } from "node:sqlite";
import { Address } from "@gnoworld/schemas";
import { openDatabase } from "@gnoworld/service/db";
import { logger } from "@gnoworld/service/log";
import type { Send } from "@gnoworld/service/net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { makeApp } from "../app.ts";
import { migrations } from "../migrations.ts";
import { fakeChain } from "../testing/fakeWorldsChain.ts";
import { wallet } from "../testing/signer.ts";
import type { CardRoutesOptions } from "../cards/routes.ts";
import { mountOwners } from "./wire.ts";

// The universes the app is built from, as prices/universes.test.ts reads them.
const UNIVERSES = new URL("../../../app/data/universes.json", import.meta.url).pathname;

// The server's own `send`, replaced by what a test sets: only the default universe's readers use it.
const chainSend = vi.hoisted(() => ({ now: undefined as Send | undefined }));
vi.mock("@gnoworld/service/net", async (original) => ({
  ...(await original<typeof import("@gnoworld/service/net")>()),
  send: (...args: Parameters<Send>) => (chainSend.now ?? (() => Promise.reject(new Error("no chain"))))(...args),
}));

// Part 4's wiring, on a real database and the real routes: which pool of owner reads each route uses (the display pool for what a page shows,
// the action pool for every act), and what judging a mute's target tells (rights and privacy reviews).
const ORIGIN = "https://gnoworld.test";
const ROOM = "#acme-feed";
const [OWNER, MOD, FREE, LINKED, MAKER] = [
  wallet().address,
  wallet().address,
  wallet().address,
  wallet().address,
  wallet().address,
] as const;
const TOKENS = new Map<string, Address>([
  ["owner", OWNER],
  ["mod", MOD],
  ["maker", MAKER],
]);

const opened: DatabaseSync[] = [];
afterEach(() => {
  for (const db of opened.splice(0)) db.close();
  chainSend.now = undefined;
});

type Pool = ((...args: [string, string]) => Promise<Address | undefined>) & {
  lookup: (...args: [string, string]) => Promise<Address | undefined>;
};
interface Options {
  /** The readers' pools; null for a server with no universe. The default holds "acme" for OWNER and every other namespace for MOD. */
  readers?: { act: Pool; show: Pool } | null;
  /** null for a server that knows no hubs. */
  hubs?: ReadonlyMap<string, string> | null;
  universes?: string | undefined;
  chains?: string[];
  /** The link cards' flow: the routes are mounted only with one. */
  cards?: CardRoutesOptions["cards"];
}

function setup({
  readers,
  hubs = new Map([["hubby", "acme/feed"]]),
  universes,
  chains = ["fallback-1"],
  cards,
}: Options = {}) {
  const db = openDatabase(":memory:", migrations);
  opened.push(db);
  db.prepare("INSERT INTO rooms (name, world, created_at) VALUES (?, 'acme-feed', 0)").run(ROOM);
  db.prepare("INSERT INTO realm_rooms (name, path) VALUES (?, 'gno.land/r/acme/feed')").run(ROOM);
  db.prepare("INSERT INTO identities (id, created_at) VALUES ('i', 0)").run();
  for (const address of [OWNER, LINKED])
    db.prepare("INSERT INTO links (address, identity, kind, linked_at) VALUES (?, 'i', 'adena', 0)").run(address);
  const calls: string[] = [];
  const pool = (name: string) => {
    const read = (namespace: string) => {
      calls.push(name);
      return Promise.resolve(namespace === "acme" ? OWNER : namespace === "gone" ? undefined : MOD);
    };
    return Object.assign(read, { lookup: read });
  };
  const sent: string[] = [];
  const log = logger("a-pepper-of-forty-characters-0123456789", () => undefined);
  const app = makeApp(log, () => true);
  mountOwners(app, {
    db,
    config: {
      universes,
      chains,
      origins: [ORIGIN],
      trustedProxy: undefined,
      pepper: "a-pepper-of-forty-characters-0123456789",
    },
    hubs: hubs ?? undefined,
    chat: {
      staff: (_room, who) => who === MOD,
      mayRead: () => true,
      pins: {
        list: () => [],
        add: () => Promise.resolve("pinned"),
        remove: () => true,
        drop: () => undefined,
        edited: () => undefined,
        check: () => Promise.resolve(),
      },
      rooms: { maker: (room) => (room === ROOM ? MAKER : undefined) },
      hide: (room, msgid) => sent.push(`hide ${room} ${msgid}`) > 0,
      muteKeeping: (account) => {
        sent.push(`mute ${account}`);
        return "muted";
      },
      roomsOf: () => [ROOM],
      ...(cards === undefined ? {} : { cards }),
    },
    ...(universes === undefined
      ? { readers: readers === null ? undefined : (readers ?? { act: pool("act"), show: pool("show") }) }
      : {}),
    spared: () => false,
    session: (token) => TOKENS.get(token ?? ""),
    signedAt: () => Date.now(),
    log,
  });
  const room = (name: string) => db.prepare("INSERT INTO rooms (name, world, created_at) VALUES (?, 'x', 0)").run(name);
  const ask = (method: string, path: string, { who, body }: { who: string; body?: unknown }) =>
    app.request(
      path,
      {
        method,
        headers: {
          cookie: `__Host-session=${who}`,
          ...(method === "GET" ? {} : { origin: ORIGIN, "content-type": "application/json" }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      },
      { incoming: { socket: { remoteAddress: "203.0.113.7" } } },
    );
  return { calls, sent, ask, room };
}

describe("the pools of owner reads", () => {
  it("gives the pins list's `may` the display pool alone", async () => {
    const t = setup();
    const response = await t.ask("GET", `/api/pins?room=${encodeURIComponent(ROOM)}`, { who: "owner" });
    expect(await response.json()).toMatchObject({ may: true });
    expect(t.calls).toEqual(["show"]);
  });

  it("gives the links' worlds hint the display pool alone", async () => {
    const t = setup();
    const response = await t.ask("GET", "/api/links", { who: "owner" });
    expect(await response.json()).toMatchObject({ worlds: ["hubby"] });
    expect(t.calls.length).toBeGreaterThan(0);
    expect(new Set(t.calls)).toEqual(new Set(["show"]));
  });

  it("gives a pin its right from the action pool, the list it answers from the display pool", async () => {
    const t = setup();
    const response = await t.ask("POST", "/api/pins", { who: "owner", body: { room: ROOM, msgid: "m1" } });
    expect(response.status).toBe(200);
    expect(t.calls).toEqual(["act", "show"]);
  });

  it("gives a hide its right from the action pool alone", async () => {
    const t = setup();
    expect(
      (await t.ask("POST", "/api/moderation/hide", { who: "owner", body: { room: ROOM, msgids: ["m1"] } })).status,
    ).toBe(200);
    expect(new Set(t.calls)).toEqual(new Set(["act"]));
  });
});

describe("judging a mute's target tells nothing of links (privacy review, low)", () => {
  it("answers a moderator muting a linked account of the holder as it does a free account", async () => {
    const [linked, free] = [setup(), setup()];
    const a = await linked.ask("POST", "/api/moderation/mute", { who: "mod", body: { room: ROOM, account: LINKED } });
    const b = await free.ask("POST", "/api/moderation/mute", { who: "mod", body: { room: ROOM, account: FREE } });
    expect([a.status, await a.json()]).toEqual([b.status, await b.json()]);
    expect(a.status).toBe(200);
  });

  it("still refuses the address that holds the namespace, and an owner muting an account of its own identity", async () => {
    const t = setup();
    const holder = await t.ask("POST", "/api/moderation/mute", { who: "mod", body: { room: ROOM, account: OWNER } });
    expect(holder.status).toBe(403);
    const own = await t.ask("POST", "/api/moderation/mute", { who: "owner", body: { room: ROOM, account: LINKED } });
    expect(own.status).toBe(403);
    expect(t.sent).toEqual([]);
  });
});

describe("the wiring of a server with no chain, an unplaced room and a hub's main room (the mutants of slice 13)", () => {
  const pin = (t: ReturnType<typeof setup>, room: string, who = "owner") =>
    t.ask("POST", "/api/moderation/hide", { who, body: { room, msgids: ["m1"] } });

  it("refuses an owner's hide for want of a reader, and lists no world, where no universe is read", async () => {
    const t = setup({ readers: null });
    expect((await pin(t, ROOM)).status).toBe(403);
    const response = await t.ask("GET", "/api/links", { who: "owner" });
    expect([response.status, await response.json()]).toMatchObject([200, { worlds: [] }]);
  });

  it("makes no owner read for a room it cannot place, and refuses", async () => {
    const t = setup();
    t.room("#nowhere");
    expect((await pin(t, "#nowhere")).status).toBe(403);
    expect(t.calls).toEqual([]);
  });

  it("gives a hub's main room the namespace of the hub's first realm, and mounts with no hubs at all", async () => {
    const t = setup();
    t.room("#hubby");
    expect((await pin(t, "#hubby")).status).toBe(200);
    expect(t.calls).toEqual(["act"]);
    expect(setup({ hubs: null }).calls).toEqual([]);
  });

  it("gives an Earth room's maker the right to hide in it, with no owner read, and with no reader at all", async () => {
    const t = setup();
    expect((await pin(t, ROOM, "maker")).status).toBe(200);
    expect(t.calls).toEqual([]);
    expect((await pin(setup({ readers: null }), ROOM, "maker")).status).toBe(200);
  });

  it("lists the hubs whose namespace a member holds, and no other: not one held by another, not one whose read failed", async () => {
    const t = setup({
      hubs: new Map([
        ["hubby", "acme/feed"],
        ["strange", "other/x"],
        ["gone", "gone/y"],
      ]),
    });
    const response = await t.ask("GET", "/api/links", { who: "owner" });
    expect(await response.json()).toMatchObject({ worlds: ["hubby"] });
  });
});

describe("the links' text and block as the server wires them (the mutants of slice 13)", () => {
  const challenge = async (t: ReturnType<typeof setup>, kind: "adena" | "cli") =>
    z
      .record(z.string(), z.unknown())
      .parse(
        await (await t.ask("POST", "/api/links/challenge", { who: "owner", body: { kind, address: FREE } })).json(),
      );

  it("names the chain of the universe's, else the first of the config's, in the text a link signs", async () => {
    const without = await challenge(setup(), "adena");
    expect(String(without["text"])).toContain("on fallback-1.");
    expect(without["chainId"]).toBe("fallback-1");
    const wired = await challenge(setup({ universes: UNIVERSES }), "adena");
    expect(String(wired["text"])).toContain("on onyx-1.");
    expect(wired["chainId"]).toBe("onyx-1");
  });

  it("gives a command-line link its block: the heredoc writing the one-line document naming the address and the memo, then the command", async () => {
    const answer = await challenge(setup(), "cli");
    const lines = String(answer["block"]).split("\n");
    expect(lines).toHaveLength(4);
    expect(lines[0]).toBe("cat > link.json <<'END'");
    expect(lines[2]).toBe("END");
    expect(JSON.parse(lines[1] ?? "")).toMatchObject({ memo: answer["memo"], msg: [{ from_address: FREE }] });
    expect(lines[3]).toContain("gnokey sign");
    expect(String(answer["block"]).endsWith("\n")).toBe(false);
  });

  it("reads the owner on the default universe's chain when it has one", async () => {
    const chain = fakeChain({ eval: () => `("${OWNER}" string)` });
    chainSend.now = chain.send;
    const t = setup({ universes: UNIVERSES });
    expect(
      (await t.ask("POST", "/api/moderation/hide", { who: "owner", body: { room: ROOM, msgids: ["m1"] } })).status,
    ).toBe(200);
    expect(chain.asked.map(({ kind }) => kind)).toEqual(["vm/qeval"]);
  });

  it("mounts the link cards' routes beside the pins, with the owner-aware right to remove, and only where the cards run", async () => {
    const removed: string[] = [];
    const cards = {
      lines: () => [],
      content: () => undefined,
      picture: () => undefined,
      known: () => true,
      isAuthor: () => false,
      remove: (room: string, msgid: string) => removed.push(`${room} ${msgid}`) > 0,
    };
    const on = setup({ cards });
    const body = { room: ROOM, msgid: "m1" };
    expect((await on.ask("POST", "/api/cards/remove", { who: "owner", body })).status).toBe(200);
    expect((await on.ask("POST", "/api/cards/remove", { who: "mod", body })).status).toBe(200);
    expect(removed).toEqual([`${ROOM} m1`, `${ROOM} m1`]);
    expect((await setup().ask("POST", "/api/cards/remove", { who: "owner", body })).status).toBe(404);
  });
});
