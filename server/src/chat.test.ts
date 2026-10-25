import type { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { makeApp } from "./app.ts";
import { startChat, type Chat } from "./chat.ts";
import { openDatabase } from "./db.ts";
import { logger } from "./log.ts";
import { ROOM_TABLES } from "./rooms/rooms.ts";
import { fakeErgo, message, PASSWORD, welcome } from "./testing/fakeErgo.ts";

const T0 = Date.parse("2026-10-22T12:00:00.000Z");
const MINUTE = 60_000;
const log = logger("a-pepper-of-forty-characters-0123456789", () => true);
const started: { db: DatabaseSync; chat: Chat }[] = [];
afterEach(async () => {
  for (const { db, chat } of started.splice(0)) {
    await chat.stop();
    db.close();
  }
});

const setup = (settings: Parameters<typeof startChat>[1], now?: () => number) => {
  const db = openDatabase(":memory:", [ROOM_TABLES]);
  const chat = startChat(db, settings, now === undefined ? { log } : { log, now });
  started.push({ db, chat });
  const app = makeApp(log, () => true);
  app.route("/api/activity", chat.routes);
  const rooms = async (worlds: string) => (await app.request(`/api/activity?worlds=${worlds}`)).text();
  return { db, rooms };
};

describe("the chat, as the server starts it", () => {
  it("makes each world's main room, and answers their activity with no link when Ergo is not set", async () => {
    const { rooms } = setup({ worlds: ["earth", "bubble"], ergo: undefined }, () => T0);
    expect(await rooms("earth,bubble")).toBe(
      JSON.stringify({
        rooms: [
          { world: "earth", room: "#earth", perMinute: 0 },
          { world: "bubble", room: "#bubble", perMinute: 0 },
        ],
      }),
    );
  });

  it("counts what the link hands on, by the clock it is given", async () => {
    const ergo = await fakeErgo();
    const clock = { now: T0 };
    const ergoAt = { host: "127.0.0.1", port: ergo.port, password: PASSWORD };
    const { rooms } = setup({ worlds: ["bubble"], ergo: ergoAt }, () => clock.now);
    const peer = await ergo.peer(0);
    await welcome(peer);
    peer.say(message("account=g1a;msgid=m1", "a!u@h", ["#bubble", "hi"]));
    const rate = (perMinute: number) => JSON.stringify({ rooms: [{ world: "bubble", room: "#bubble", perMinute }] });
    await expect.poll(() => rooms("bubble")).toBe(rate(0.2));
    clock.now += 5 * MINUTE;
    expect(await rooms("bubble")).toBe(rate(0));
  });

  it("leaves Ergo when it stops, and never connects again", async () => {
    const ergo = await fakeErgo();
    const ergoAt = { host: "127.0.0.1", port: ergo.port, password: PASSWORD };
    setup({ worlds: ["bubble"], ergo: ergoAt }, () => T0);
    const peer = await ergo.peer(0);
    await welcome(peer);
    const left = new Promise((resolve) => peer.socket.once("close", resolve));
    await started.at(-1)?.chat.stop();
    await left;
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(ergo.peers).toHaveLength(1);
  });

  it("keeps the system's clock by default", () => {
    const before = Date.now();
    const { db } = setup({ worlds: ["earth"], ergo: undefined });
    const { at } = z.object({ at: z.number() }).parse(db.prepare("SELECT created_at AS at FROM rooms").get());
    expect(at).toBeGreaterThanOrEqual(before);
    expect(at).toBeLessThanOrEqual(Date.now());
  });
});
