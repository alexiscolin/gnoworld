import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { openDatabase } from "@gnoworld/service/db";
import { logger } from "@gnoworld/service/log";
import type { Send } from "@gnoworld/service/net";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Roles } from "../roles/roles.ts";
import { makeApp } from "../app.ts";
import { loadConfig, type Config } from "../config.ts";
import { fakeChain, RPC } from "../testing/fakeWorldsChain.ts";
import { EARTH_TABLES, makeRooms, REALM_TABLES, ROOM_STATE } from "./create.ts";
import { roomsBoot } from "./roomsBoot.ts";
import { ensureRooms, listRooms, ROOM_TABLES } from "./rooms.ts";

// How the process wires D413: the worlds file's rooms made ahead on a timer, the unlisted path's chain read on the universe's own RPC.
const dir = mkdtempSync(join(tmpdir(), "gnoworld-boot-"));
afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});
const UNIVERSES = fileURLToPath(new URL("../../../app/data/universes.json", import.meta.url));
const PEPPER = "a-pepper-of-forty-characters-0123456789";
const ORIGIN = "https://gnoworld.test";
const pepper = join(dir, "pepper");
writeFileSync(pepper, PEPPER);
const worlds = join(dir, "worlds.json");
writeFileSync(
  worlds,
  JSON.stringify({
    version: 1,
    universe: "onyx",
    updated: "2026-11-08T10:00:00.000Z",
    worlds: [
      {
        id: "leon",
        namespace: "leon",
        realms: [
          {
            path: "gno.land/r/leon",
            deployer: null,
            deployerName: null,
            functions: [],
            imports: [],
            calls: null,
            callers: null,
            lastHeight: null,
          },
        ],
      },
    ],
  }),
);

const configOf = (extra: Record<string, string>): Config =>
  loadConfig({ DATABASE: join(dir, "server.db"), LOG_PEPPER_FILE: pepper, ORIGINS: ORIGIN, ...extra });

const boot = (config: Config, over: { send?: Send } = {}) => {
  const db = openDatabase(":memory:", [ROOM_TABLES, ROOM_STATE, REALM_TABLES, EARTH_TABLES]);
  ensureRooms(db, ["earth"], 0);
  const rooms = makeRooms({ db, send: () => true, now: () => 0, max: 20 });
  const log = logger(PEPPER, () => undefined);
  const app = makeApp(log, () => true);
  const roles: Roles = { team: new Set(), trusted: new Set(), worlds: new Map() };
  const started = roomsBoot(app, config, {
    roles,
    rooms,
    session: () => undefined,
    log,
    nameCheck: undefined,
    ...(over.send === undefined ? {} : { send: over.send }),
  });
  return { db, app, started };
};
const names = (db: ReturnType<typeof boot>["db"]): string[] => listRooms(db).map(({ name }) => name);

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("roomsBoot", () => {
  it("makes the listed realms' and the hubs' rooms by itself after a minute, and again for a file the job writes anew", async () => {
    const { db, started } = boot(configOf({ WORLDS_FILE: worlds, UNIVERSES_FILE: UNIVERSES }));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(names(db)).toContain("#leon");
    expect(names(db)).toContain("#bubble");
    started.stop();
  });

  it("reads the chain of the universe the worlds file is of, for a path the file does not list", async () => {
    const chain = fakeChain({ paths: (prefix) => (prefix === "gno.land/r/sys/namereg/v0" ? prefix : "") });
    const { db, app, started } = boot(configOf({ WORLDS_FILE: worlds, UNIVERSES_FILE: UNIVERSES }), {
      send: chain.send,
    });
    const response = await app.request(
      "/api/rooms/realm",
      {
        method: "POST",
        headers: { origin: ORIGIN, "content-type": "application/json" },
        body: JSON.stringify({ path: "gno.land/r/sys/namereg/v0" }),
      },
      { incoming: { socket: { remoteAddress: "203.0.113.7" } } },
    );
    expect(response.status).toBe(200);
    expect(chain.asked.length).toBe(1);
    expect(chain.asked[0]?.url.startsWith(RPC.replace(/:443$/, ""))).toBe(true);
    expect(names(db).length).toBeGreaterThan(1);
    started.stop();
  });

  it("makes nothing, starts no timer and mounts no route when the config has no worlds file", async () => {
    const { db, app, started } = boot(configOf({}));
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(names(db)).toEqual(["#earth"]);
    expect(vi.getTimerCount()).toBe(0);
    const response = await app.request("/api/rooms/realm", { method: "POST", headers: { origin: ORIGIN } });
    expect(response.status).not.toBe(200);
    started.stop();
  });

  it("holds no timer open by itself (unref) and none at all once stopped", () => {
    const unref = vi.spyOn(globalThis, "setInterval");
    const { started } = boot(configOf({ WORLDS_FILE: worlds, UNIVERSES_FILE: UNIVERSES }));
    const timer = unref.mock.results.at(-1)?.value as { hasRef?: () => boolean } | undefined;
    expect(timer?.hasRef?.()).toBe(false);
    started.stop();
    expect(vi.getTimerCount()).toBe(0);
  });
});
