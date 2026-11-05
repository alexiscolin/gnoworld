import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Hubs, Universes } from "@gnoworld/schemas";
import { logger } from "@gnoworld/service/log";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeApp } from "../../app.ts";
import { makeStream, type Stream } from "../../stream/stream.ts";
import { blocks, NAMEREG, registration } from "../../testing/chainRecorded.ts";
import type { ChainSocket } from "./follow.ts";
import { readChainData, RETRY_MS, startChain } from "./start.ts";

// Slice 9g (red pass): the server's wiring, from the data's files to a page's stream, with a fake socket and a fake indexer: a
// recorded call to a world's realm becomes `event: chain` to its room, an indexer with no address a socket may go to is skipped
// and said, a stop closes every socket. The settings it needs: UNIVERSES_FILE (existing) and HUBS_FILE (new), both absolute.
const universe = (id: string, indexer: string) => ({
  id,
  name: id,
  chainId: `${id}-1`,
  rpc: "https://rpc.example.test:443",
  gnoweb: "https://web.example.test",
  indexer,
  testnet: true,
  ...(id === "onyx" ? { default: true } : {}),
});
const world = (slug: string, universeId: string, realms?: string[]) => ({
  slug,
  name: slug,
  description: `${slug}, a world of the test, with the fifty characters the data's schema asks of a description`,
  universe: universeId,
  ...(realms === undefined ? {} : { realms }),
});

class FakeSocket implements ChainSocket {
  sent: string[] = [];
  closed = false;
  private listeners = new Map<string, ((event: { data?: unknown }) => void)[]>();
  readonly url: string;
  constructor(url: string) {
    this.url = url;
  }
  send(text: string): void {
    this.sent.push(text);
  }
  close(): void {
    this.closed = true;
  }
  addEventListener(type: string, listener: (event: { data?: unknown }) => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }
  emit(type: string, data?: unknown): void {
    for (const listener of this.listeners.get(type) ?? []) listener({ data });
  }
}

const streams: Stream[] = [];
const folders: string[] = [];
afterEach(() => {
  for (const stream of streams.splice(0)) stream.close();
  for (const dir of folders.splice(0)) rmSync(dir, { recursive: true, force: true });
});

// A stream a client reads, and the chain started on it with a fake socket for each universe and an indexer with an empty day.
function setup(universes: ReturnType<typeof universe>[], plain: string[] = [], down = false) {
  const stream = makeStream();
  streams.push(stream);
  const log = vi.fn();
  const sockets: FakeSocket[] = [];
  const timers: { ms: number; run: () => void }[] = [];
  const day = () => new Response(JSON.stringify({ data: { getTransactions: [] } }));
  let history: () => Response = down ? () => new Response("no", { status: 500 }) : day;
  const chain = startChain({
    // An address the data's schema refuses (http) is set after it: the wiring does not trust the schema's work alone.
    universes: Universes.parse(universes).map((each) =>
      plain.includes(each.id) ? { ...each, indexer: "http://indexer.plain.test/q" } : each,
    ),
    hubs: Hubs.parse([world("govdao", "onyx", [NAMEREG]), world("other", "gnoland", ["gno.land/r/other/realm"])]),
    stream,
    log,
    now: () => Date.parse("2026-11-05T05:02:00Z"),
    open: (url) => {
      const socket = new FakeSocket(url);
      sockets.push(socket);
      return socket;
    },
    send: () => Promise.resolve(history()),
    wait: () => new Promise<undefined>(() => undefined),
    random: () => 0.5,
    after: (ms, run) => {
      timers.push({ ms, run });
      return () => undefined;
    },
  });
  const app = makeApp(
    logger("a-pepper-of-forty-characters-0123456789", () => true),
    () => true,
  );
  app.route("/api/stream", stream.routes({ proxy: undefined, visible: () => true }));
  const open = async (rooms: string) => {
    const response = await app.request(
      `/api/stream?rooms=${encodeURIComponent(rooms)}`,
      {},
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
    return { until, cancel: () => reader?.cancel() };
  };
  return { chain, log, sockets, timers, open, heal: () => (history = day) };
}
const first = (sockets: FakeSocket[]): FakeSocket => {
  const socket = sockets[0];
  if (socket === undefined) throw new Error("no socket");
  return socket;
};
const ack = (socket: FakeSocket): void => {
  socket.emit("open");
  socket.emit("message", '{"type":"connection_ack"}');
};

describe("the chain on the server", () => {
  it("makes a recorded call to a world's realm an `event: chain` to that world's room, and the count of the day one to the Earth's", async () => {
    const { chain, sockets, open } = setup([universe("onyx", "https://indexer.example.test/graphql/query")]);
    const room = await open("#govdao");
    const earth = await open("#earth");
    await vi.waitFor(() => {
      expect(sockets).toHaveLength(1);
    });
    expect(sockets[0]?.url).toBe("wss://indexer.example.test/graphql/query");
    ack(first(sockets));
    sockets[0]?.emit("message", registration(0));
    sockets[0]?.emit("message", blocks[0]);
    const text = await room.until('"height":55414');
    expect(text).toMatch(
      /event: chain\ndata: \{"kind":"call","universe":"onyx","world":"govdao","realm":"gno.land\/r\/sys\/namereg\/v0","actor":"g1mpkp5lm8lwpm0pym4388836d009zfe4maxlqsq","func":"Register","height":55414\}/,
    );
    expect(await earth.until("event: realms")).toContain('"count":0');
    chain.stop();
    await Promise.all([room.cancel(), earth.cancel()]);
  });

  it("follows each universe on its own indexer, a call of one never a line of the other's world", async () => {
    const { chain, sockets } = setup([
      universe("onyx", "https://indexer.example.test/q"),
      universe("gnoland", "https://indexer.other.test/q"),
    ]);
    await vi.waitFor(() => {
      expect(sockets.map(({ url }) => url).toSorted()).toEqual([
        "wss://indexer.example.test/q",
        "wss://indexer.other.test/q",
      ]);
    });
    chain.stop();
  });

  it("skips an indexer that has no address a socket may go to over TLS, said, and follows the others", async () => {
    const { chain, sockets, log } = setup(
      [universe("onyx", "https://indexer.example.test/q"), universe("plain", "https://indexer.plain.test/q")],
      ["plain"],
    );
    await vi.waitFor(() => {
      expect(sockets).toHaveLength(1);
    });
    expect(log).toHaveBeenCalledWith("chain_universe_skipped", { reason: "plain" });
    chain.stop();
  });

  it("closes every socket when it is stopped, and opens none when stopped before the day's count came", async () => {
    const running = setup([
      universe("onyx", "https://indexer.example.test/q"),
      universe("gnoland", "https://indexer.other.test/q"),
    ]);
    await vi.waitFor(() => {
      expect(running.sockets).toHaveLength(2);
    });
    running.chain.stop();
    expect(running.sockets.every(({ closed }) => closed)).toBe(true);
    const early = setup([universe("onyx", "https://indexer.example.test/q")]);
    early.chain.stop();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(early.sockets).toHaveLength(0);
  });

  it("asks the day's count again after a minute when the indexer could not give it, and tells it once it does", async () => {
    const { chain, sockets, timers, heal, log, open } = setup(
      [universe("onyx", "https://indexer.example.test/q")],
      [],
      true,
    );
    const earth = await open("#earth");
    await vi.waitFor(() => {
      expect(sockets).toHaveLength(1);
    });
    expect(log).toHaveBeenCalledWith("chain_history_failed", { reason: "onyx" });
    ack(first(sockets));
    sockets[0]?.emit("message", blocks[0]);
    sockets[0]?.emit("message", blocks[1]);
    heal();
    timers.find(({ ms }) => ms === RETRY_MS)?.run();
    // The retry's own answer arrives through a few promises of the fake indexer.
    await new Promise((resolve) => setTimeout(resolve, 30));
    sockets[0]?.emit("message", blocks[1]);
    // The count of the day, known now, is told at the next block, and not a made one before.
    expect(await earth.until("event: realms")).toContain('"count":0');
    chain.stop();
    await earth.cancel();
  });
});

describe("the chain's data", () => {
  const files = (universes: unknown, hubs: unknown) => {
    const dir = mkdtempSync(join(tmpdir(), "gnoworld-chain-"));
    folders.push(dir);
    writeFileSync(join(dir, "universes.json"), JSON.stringify(universes));
    writeFileSync(join(dir, "hubs.json"), JSON.stringify(hubs));
    return [join(dir, "universes.json"), join(dir, "hubs.json")] as const;
  };

  it("reads the universes and the hubs through the data's own schemas", () => {
    const [universes, hubs] = files(
      [universe("onyx", "https://indexer.example.test/q")],
      [world("govdao", "onyx", [NAMEREG])],
    );
    const data = readChainData(universes, hubs);
    expect(data.universes.map(({ id }) => id)).toEqual(["onyx"]);
    expect(data.hubs.map(({ slug }) => slug)).toEqual(["govdao"]);
  });

  it("fails, naming the file and nothing of what it held, on a list that is no good or a file that is not there", () => {
    const [universes, hubs] = files([{ id: "<b>secret</b>" }], []);
    expect(() => readChainData(universes, hubs)).toThrow(universes);
    expect(() => readChainData(universes, hubs)).not.toThrow(/secret/);
    expect(() => readChainData("/nowhere/universes.json", hubs)).toThrow("/nowhere/universes.json");
    const [good, badHubs] = files([universe("onyx", "https://indexer.example.test/q")], [{ slug: "<b>" }]);
    expect(() => readChainData(good, hubs)).not.toThrow();
    // Good universes with a hubs file that is no good: the hubs are judged, and named, not what they held.
    expect(() => readChainData(good, badHubs)).toThrow(badHubs);
    expect(() => readChainData(good, badHubs)).not.toThrow(/<b>/);
  });
});
