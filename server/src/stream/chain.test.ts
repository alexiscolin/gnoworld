import { Address } from "@gnoworld/schemas";
import { ChainEvent, RealmsDeployed } from "@gnoworld/schemas/indexer";
import { logger } from "@gnoworld/service/log";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeApp } from "../app.ts";
import { makeStream, type Stream } from "./stream.ts";

// Slice 9g: the chain's events reach a page on the server's existing stream, as their own events `chain` and `realms`, to the
// readers who follow the room and may read it, live only (the indexer gives them again; nothing is stored here) but for the
// Earth's last count, which a page that opens later still needs.

// worldOf, counted: an event must not split a client's rooms again (F5774).
const worlds = vi.hoisted(() => ({ asked: 0 }));
vi.mock("../rooms/rooms.ts", async (original) => {
  const rooms = await original<typeof import("../rooms/rooms.ts")>();
  return {
    ...rooms,
    worldOf: (room: string) => {
      worlds.asked += 1;
      return rooms.worldOf(room);
    },
  };
});
const ALICE = Address.parse("g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv");
const CALL: ChainEvent = {
  id: "h900030:0",
  kind: "call",
  universe: "onyx",
  world: "govdao",
  realm: "gno.land/r/gov/dao",
  func: "MustVoteOnProposal",
  actor: ALICE,
  height: 900030,
};
const DEPLOY: ChainEvent = {
  id: "h887427:0",
  kind: "deploy",
  universe: "onyx",
  realm: `gno.land/r/${ALICE}/counter`,
  actor: ALICE,
  height: 887427,
};
const COUNT: RealmsDeployed = { universe: "onyx", count: 17, height: 908297 };

const streams: Stream[] = [];
afterEach(() => {
  for (const stream of streams.splice(0)) stream.close();
});

function setup(visible: (room: string) => boolean = () => true) {
  const stream = makeStream();
  streams.push(stream);
  const app = makeApp(
    logger("a-pepper-of-forty-characters-0123456789", () => true),
    () => true,
  );
  app.route("/api/stream", stream.routes({ proxy: undefined, visible }));
  const open = async (rooms: string, lastId?: number) => {
    const response = await app.request(
      `/api/stream?rooms=${encodeURIComponent(rooms)}`,
      lastId === undefined ? {} : { headers: { "last-event-id": String(lastId) } },
      { incoming: { socket: { remoteAddress: "203.0.113.7" } } },
    );
    const reader: ReadableStreamDefaultReader<Uint8Array> | undefined = response.body?.getReader();
    let text = "";
    const until = async (end: string): Promise<string> => {
      while (!text.includes(end)) {
        const chunk = await reader?.read();
        if (chunk === undefined || chunk.done) break;
        text += new TextDecoder().decode(chunk.value);
      }
      return text;
    };
    return { settled: () => until("event: since"), until, cancel: () => reader?.cancel() };
  };
  return { stream, open };
}
const sent = <T>(text: string, name: string, schema: { parse: (value: unknown) => T }): T[] =>
  [...text.matchAll(new RegExp(`event: ${name}\\ndata: (.*)\\n\\n`, "g"))].map(([, data = ""]) =>
    schema.parse(JSON.parse(data)),
  );

describe("the stream's chain event", () => {
  it("tells a reader of the world's room a call to that world's realm, as an event of its own, with an id", async () => {
    const { stream, open } = setup();
    const client = await open("#govdao");
    await client.settled();
    stream.chain(CALL);
    const text = await client.until("event: chain");
    expect(await client.until(`"height":900030`)).toMatch(/id: \d+\nevent: chain\ndata: /);
    expect(sent(text, "chain", ChainEvent)).toEqual([CALL]);
    expect(text).not.toContain("event: verdict");
    await client.cancel();
  });

  it("tells a reader of another room of the same world, and no reader of another world", async () => {
    const { stream, open } = setup();
    const same = await open("#govdao/crew");
    const other = await open("#bubble");
    await Promise.all([same.settled(), other.settled()]);
    stream.chain(CALL);
    stream.publish({ msgid: "m1", room: "#bubble", state: "checked" });
    expect(sent(await same.until("event: chain"), "chain", ChainEvent)).toEqual([CALL]);
    const text = await other.until("event: verdict");
    expect(text).not.toContain("event: chain");
    await Promise.all([same.cancel(), other.cancel()]);
  });

  it("tells a deploy, which names no world, to the readers of the Earth's room alone", async () => {
    const { stream, open } = setup();
    const earth = await open("#earth");
    const world = await open("#govdao");
    await Promise.all([earth.settled(), world.settled()]);
    stream.chain(DEPLOY);
    stream.publish({ msgid: "m1", room: "#govdao", state: "checked" });
    expect(sent(await earth.until("event: chain"), "chain", ChainEvent)).toEqual([DEPLOY]);
    expect(await world.until("event: verdict")).not.toContain("event: chain");
    await Promise.all([earth.cancel(), world.cancel()]);
  });

  it("finds a client's worlds once, when its stream opens, never again for an event", async () => {
    const { stream, open } = setup();
    const rooms = Array.from({ length: 25 }, (_, n) => `#w${String(n)}`);
    const client = await open(rooms.join(","));
    await client.settled();
    worlds.asked = 0;
    for (let n = 0; n < 40; n += 1) stream.chain(CALL);
    stream.signal({ kind: "chart", world: "govdao", account: ALICE, at: "2026-11-05T12:00:00.000Z" });
    expect(worlds.asked).toBe(0);
    await client.cancel();
  });

  it("tells nothing to a reader who may not read the room", async () => {
    const { stream, open } = setup((room) => !room.startsWith("#govdao"));
    const client = await open("#govdao");
    await client.settled();
    stream.chain(CALL);
    stream.close();
    expect(sent(await client.until("never"), "chain", ChainEvent)).toEqual([]);
  });

  it("does not replay it to a reader who comes after: nothing of the chain is stored here", async () => {
    const { stream, open } = setup();
    stream.chain(CALL);
    stream.chain(DEPLOY);
    const late = await open("#govdao,#earth");
    expect(sent(await late.settled(), "chain", ChainEvent)).toEqual([]);
    await late.cancel();
  });

  it("is told in the verdicts' sequence of ids: a client that comes back asks for the newest it has and gets no gap in ids", async () => {
    const { stream, open } = setup();
    const client = await open("#govdao");
    await client.settled();
    stream.chain(CALL);
    stream.publish({ msgid: "m1", room: "#govdao", state: "checked" });
    const text = await client.until("event: verdict");
    const ids = [...text.matchAll(/id: (\d+)\nevent: (?:chain|verdict)/g)].map(([, id = ""]) => Number(id));
    expect(ids).toHaveLength(2);
    expect(ids[1]).toBeGreaterThan(ids[0] ?? Infinity);
    await client.cancel();
  });
});

describe("the stream's realms event", () => {
  it("tells the Earth's readers the count, and replays the last one of each universe to a reader who comes after", async () => {
    const { stream, open } = setup();
    stream.realms({ ...COUNT, count: 16, height: 908290 });
    stream.realms(COUNT);
    stream.realms({ universe: "gnoland", count: 3, height: 1325774 });
    const late = await open("#earth");
    expect(sent(await late.settled(), "realms", RealmsDeployed)).toEqual([
      COUNT,
      { universe: "gnoland", count: 3, height: 1325774 },
    ]);
    await late.cancel();
  });

  // F5781: a reader that comes back with its newest id is replayed the counts after it, not the ones it has.
  it("replays to a returning reader only the counts newer than its Last-Event-ID", async () => {
    const { stream, open } = setup();
    stream.realms(COUNT);
    stream.realms({ universe: "gnoland", count: 3, height: 1325774 });
    const first = await open("#earth");
    const text = await first.settled();
    const ids = [...text.matchAll(/id: (\d+)\nevent: realms/g)].map(([, id = ""]) => Number(id));
    expect(ids).toHaveLength(2);
    const [older = 0, newer = 0] = ids;
    const returning = await open("#earth", older);
    expect(sent(await returning.settled(), "realms", RealmsDeployed)).toEqual([
      { universe: "gnoland", count: 3, height: 1325774 },
    ]);
    const current = await open("#earth", newer);
    expect(sent(await current.settled(), "realms", RealmsDeployed)).toEqual([]);
    await Promise.all([first.cancel(), returning.cancel(), current.cancel()]);
  });

  it("tells the readers of the Earth's room only, live", async () => {
    const { stream, open } = setup();
    const earth = await open("#earth");
    const world = await open("#govdao");
    await Promise.all([earth.settled(), world.settled()]);
    stream.realms(COUNT);
    stream.publish({ msgid: "m1", room: "#govdao", state: "checked" });
    expect(sent(await earth.until("event: realms"), "realms", RealmsDeployed)).toEqual([COUNT]);
    expect(await world.until("event: verdict")).not.toContain("event: realms");
    await Promise.all([earth.cancel(), world.cancel()]);
  });

  it("keeps the last count of 20 universes at most: a universe past them is told live alone", async () => {
    const { stream, open } = setup();
    for (let n = 0; n < 21; n += 1) stream.realms({ universe: `u${String(n)}`, count: n, height: n });
    const late = await open("#earth");
    expect(sent(await late.settled(), "realms", RealmsDeployed)).toHaveLength(20);
    await late.cancel();
  });
});
