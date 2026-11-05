import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Hubs, Universes } from "@gnoworld/schemas";
import { logger } from "@gnoworld/service/log";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeApp } from "../../app.ts";
import { makeStream, type Stream } from "../../stream/stream.ts";
import { NAMEREG, registration } from "../../testing/chainRecorded.ts";
import { CATCH_UP_MS, POLL_MS } from "./poll.ts";
import { readChainData, RETRY_MS, startChain } from "./start.ts";

// Slice 9g: the server's wiring, from the data's files to a page's stream, with a fake indexer behind `send`: a recorded call to
// a world's realm becomes `event: chain` to its room, an indexer with no https address is skipped and said, a stop cancels every
// timer. The settings it needs: UNIVERSES_FILE (existing) and HUBS_FILE (new), both absolute.
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

const streams: Stream[] = [];
const folders: string[] = [];
afterEach(() => {
  for (const stream of streams.splice(0)) stream.close();
  for (const dir of folders.splice(0)) rmSync(dir, { recursive: true, force: true });
});

// A recorded frame's transaction, as the indexer's query answers it.
function rowOf(frame: string): unknown {
  return (JSON.parse(frame) as { payload: { data: { getTransactions: unknown } } }).payload.data.getTransactions;
}

// A fake indexer: the tips it gives in turn (the last one again and again, "none" an answer with no height), the transactions a
// catch-up gives, and the deploys of the day.
function serve({ tips = [7000], rows = () => [], deploys = [] }: ServeOptions = {}): (query: string) => Response {
  const heights = [...tips];
  return (query) => {
    const answer = (data: unknown) => new Response(JSON.stringify({ data }));
    if (query.includes("latestBlockHeight"))
      return answer({ latestBlockHeight: heights.length > 1 ? heights.shift() : (heights[0] ?? "none") });
    if (query.includes("getBlocks")) {
      const times = [...query.matchAll(/eq: (\d+)/g)].map(([, height = ""]) => ({
        height: Number(height),
        time: "2026-11-05T04:00:00Z",
      }));
      return answer({ getBlocks: times });
    }
    return answer({ getTransactions: query.includes("heightAndIndex: DESC") ? deploys : rows() });
  };
}
interface ServeOptions {
  tips?: (number | "none")[];
  rows?: () => unknown[];
  deploys?: unknown[];
}

// A stream a client reads, and the chain started on it with a fake indexer for every universe and a fake clock for its timers.
function setup(
  universes: ReturnType<typeof universe>[],
  plain: string[] = [],
  indexer: "down" | ((query: string) => Response) = serve(),
) {
  const stream = makeStream();
  streams.push(stream);
  const log = vi.fn();
  const queries: string[] = [];
  const urls: string[] = [];
  const timers: { ms: number; run: () => void; cancelled: boolean }[] = [];
  let current = indexer === "down" ? () => new Response("no", { status: 500 }) : indexer;
  const chain = startChain({
    // An address the data's schema refuses (http) is set after it: the wiring does not trust the schema's work alone.
    universes: Universes.parse(universes).map((each) =>
      plain.includes(each.id) ? { ...each, indexer: "http://indexer.plain.test/q" } : each,
    ),
    hubs: Hubs.parse([world("govdao", "onyx", [NAMEREG]), world("other", "gnoland", ["gno.land/r/other/realm"])]),
    stream,
    log,
    now: () => Date.parse("2026-11-05T05:02:00Z"),
    send: (url, init) => {
      const query = (JSON.parse(typeof init.body === "string" ? init.body : "") as { query: string }).query;
      queries.push(query);
      urls.push(url);
      return Promise.resolve(current(query));
    },
    random: () => 0.5,
    after: (ms, run) => {
      const timer = { ms, run, cancelled: false };
      timers.push(timer);
      return () => {
        timer.cancelled = true;
      };
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
  // The timers waiting for their time: the day's count asked again and the round's own limit apart, the next round's.
  const waiting = () => timers.filter(({ ms, cancelled }) => !cancelled && ms !== RETRY_MS && ms !== CATCH_UP_MS);
  const nextRound = async (): Promise<number> => {
    await vi.waitFor(() => {
      expect(waiting()).toHaveLength(1);
    });
    const each = waiting()[0];
    if (each === undefined) throw new Error("no timer");
    each.cancelled = true;
    each.run();
    return each.ms;
  };
  const tipsAsked = () => queries.filter((query) => query.includes("latestBlockHeight")).length;
  const following = async (): Promise<void> => {
    await vi.waitFor(() => {
      expect(log).toHaveBeenCalledWith("chain_following", { reason: expect.any(String) as unknown });
    });
  };
  return { chain, log, timers, open, queries, urls, nextRound, tipsAsked, following, heal: () => (current = serve()) };
}

describe("the chain on the server", () => {
  it("makes a recorded call to a world's realm an `event: chain` to that world's room, and the count of the day one to the Earth's", async () => {
    const { chain, open, nextRound } = setup(
      [universe("onyx", "https://indexer.example.test/graphql/query")],
      [],
      serve({ tips: [7000, 7000, 7001], rows: () => [rowOf(registration(0))] }),
    );
    const room = await open("#govdao");
    const earth = await open("#earth");
    await nextRound();
    const text = await room.until('"height":55414');
    expect(text).toMatch(
      /event: chain\ndata: \{"id":"jTQy7ZDx\+Eee5VDR\/EObtTz5tvLV432m4Q6\/gjhecw8=:0","kind":"call","universe":"onyx","world":"govdao","realm":"gno.land\/r\/sys\/namereg\/v0","actor":"g1mpkp5lm8lwpm0pym4388836d009zfe4maxlqsq","func":"Register","height":55414\}/,
    );
    expect(await earth.until("event: realms")).toContain('"count":0');
    chain.stop();
    await Promise.all([room.cancel(), earth.cancel()]);
  });

  it("says it follows a universe once it does", async () => {
    const { chain, following } = setup([universe("onyx", "https://indexer.example.test/q")]);
    await following();
    chain.stop();
  });

  it("polls on the real timer once a block, when none is given", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    try {
      const asked: string[] = [];
      const stream = makeStream();
      streams.push(stream);
      const chain = startChain({
        universes: Universes.parse([universe("onyx", "https://indexer.example.test/q")]),
        hubs: Hubs.parse([world("govdao", "onyx", [NAMEREG])]),
        stream,
        log: vi.fn(),
        now: () => Date.parse("2026-11-05T05:02:00Z"),
        send: (_url, init) => {
          const query = (JSON.parse(typeof init.body === "string" ? init.body : "") as { query: string }).query;
          if (query.includes("latestBlockHeight")) asked.push(query);
          return Promise.resolve(serve()(query));
        },
        random: () => 0.5,
      });
      // The day's history read the tip once, the first round again.
      // No waitFor here: with fake timers it moves the clock.
      for (let n = 0; n < 10; n += 1) await vi.advanceTimersByTimeAsync(0);
      expect(asked).toHaveLength(2);
      await vi.advanceTimersByTimeAsync(POLL_MS - 1);
      expect(asked).toHaveLength(2);
      await vi.advanceTimersByTimeAsync(1);
      expect(asked).toHaveLength(3);
      chain.stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it("polls each universe on its own indexer", async () => {
    const { chain, urls, tipsAsked } = setup([
      universe("onyx", "https://indexer.example.test/q"),
      universe("gnoland", "https://indexer.other.test/q"),
    ]);
    await vi.waitFor(() => {
      expect(tipsAsked()).toBe(4);
    });
    expect([...new Set(urls)].toSorted()).toEqual(["https://indexer.example.test/q", "https://indexer.other.test/q"]);
    chain.stop();
  });

  it("skips an indexer that is not https, said, and polls the others", async () => {
    const { chain, urls, log, following } = setup(
      [universe("onyx", "https://indexer.example.test/q"), universe("plain", "https://indexer.plain.test/q")],
      ["plain"],
    );
    await following();
    expect(log).toHaveBeenCalledWith("chain_universe_skipped", { reason: "plain" });
    expect(urls.every((url) => url === "https://indexer.example.test/q")).toBe(true);
    chain.stop();
  });

  it("cancels every timer when it is stopped, and starts no round when stopped before the day's count came", async () => {
    const running = setup([
      universe("onyx", "https://indexer.example.test/q"),
      universe("gnoland", "https://indexer.other.test/q"),
    ]);
    await vi.waitFor(() => {
      expect(running.timers.filter(({ ms }) => ms === POLL_MS)).toHaveLength(2);
    });
    running.chain.stop();
    expect(running.timers.filter(({ ms }) => ms === POLL_MS).every(({ cancelled }) => cancelled)).toBe(true);
    const early = setup([universe("onyx", "https://indexer.example.test/q")]);
    early.chain.stop();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(early.timers).toEqual([]);
    expect(early.tipsAsked()).toBe(1);
  });

  it("asks the day's count again after a minute when the indexer could not give it, and tells it once it does", async () => {
    const { chain, timers, heal, log, open, nextRound } = setup(
      [universe("onyx", "https://indexer.example.test/q")],
      [],
      "down",
    );
    const earth = await open("#earth");
    await vi.waitFor(() => {
      expect(log).toHaveBeenCalledWith("chain_poll_failed", { reason: "onyx" });
    });
    expect(log).toHaveBeenCalledWith("chain_history_failed", { reason: "onyx" });
    heal();
    timers.find(({ ms }) => ms === RETRY_MS)?.run();
    // The retry's own answer arrives through a few promises of the fake indexer.
    await new Promise((resolve) => setTimeout(resolve, 30));
    // The count of the day, known now, is told at the next round's tip, and not a made one before.
    await nextRound();
    expect(await earth.until("event: realms")).toContain('"count":0');
    chain.stop();
    await earth.cancel();
  });
});

// F5773: a round that fails at boot must not lose what came between the history read and its first success.
// F5788: the day's count asked again keeps one cancel, not one a minute.
describe("the day's count asked again", () => {
  const retries = <T extends { ms: number }>(timers: T[]) => timers.filter(({ ms }) => ms === RETRY_MS);

  it("is cancelled by a stop, the one pending timer, and no other is kept to cancel", async () => {
    const { chain, timers, log } = setup([universe("onyx", "https://indexer.example.test/q")], [], "down");
    await vi.waitFor(() => {
      expect(log).toHaveBeenCalledWith("chain_history_failed", { reason: "onyx" });
    });
    for (let n = 1; n <= 3; n += 1) {
      timers.findLast(({ ms }) => ms === RETRY_MS)?.run();
      await vi.waitFor(() => {
        expect(retries(timers)).toHaveLength(n + 1);
      });
    }
    chain.stop();
    // Four timers were armed, three have run: only the pending one is left to cancel.
    expect(retries(timers).map(({ cancelled }) => cancelled)).toEqual([false, false, false, true]);
  });

  it("ends when the count is known: no timer is armed once an answer came", async () => {
    const { chain, timers, heal, log } = setup([universe("onyx", "https://indexer.example.test/q")], [], "down");
    await vi.waitFor(() => {
      expect(log).toHaveBeenCalledWith("chain_history_failed", { reason: "onyx" });
    });
    heal();
    timers.find(({ ms }) => ms === RETRY_MS)?.run();
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(retries(timers)).toHaveLength(1);
    chain.stop();
  });

  it("arms no timer when the first answer came", async () => {
    const { chain, timers, following } = setup([universe("onyx", "https://indexer.example.test/q")]);
    await following();
    expect(retries(timers)).toHaveLength(0);
    chain.stop();
  });
});

describe("the catch-up after the day's history", () => {
  const deployAt = (height: number) => ({
    hash: `h${String(height)}`,
    block_height: height,
    success: true,
    messages: [
      {
        value: {
          __typename: "MsgAddPackage",
          creator: "g1zdyqzhwsg2ayg9rjh8txhgm42ntu0aajda6x7y",
          package: { path: `gno.land/r/g1zdyqzhwsg2ayg9rjh8txhgm42ntu0aajda6x7y/counter${String(height)}` },
        },
      },
    ],
  });

  const catchUps = (queries: string[]) => queries.filter((query) => query.includes("heightAndIndex: ASC"));

  it("starts from the chain's tip, read with the day's history: the first round catches up from it, though no round ran before", async () => {
    const { chain, queries } = setup(
      [universe("onyx", "https://indexer.example.test/q")],
      [],
      serve({ tips: [7000, 7002], deploys: [deployAt(4999), deployAt(4000)] }),
    );
    await vi.waitFor(() => {
      expect(catchUps(queries)).toHaveLength(1);
    });
    // Never from the newest deploy: a restart would tell the rooms every call since it as heard now.
    expect(catchUps(queries)[0]).toContain("gt: 6999");
    expect(queries.findIndex((query) => query.includes("latestBlockHeight"))).toBeLessThan(
      queries.findIndex((query) => query.includes("heightAndIndex: DESC")),
    );
    chain.stop();
  });

  it("starts from the tip on a day that held no deploy", async () => {
    const { chain, queries } = setup(
      [universe("onyx", "https://indexer.example.test/q")],
      [],
      serve({ tips: [7000, 7002] }),
    );
    await vi.waitFor(() => {
      expect(catchUps(queries)).toHaveLength(1);
    });
    expect(catchUps(queries)[0]).toContain("gt: 6999");
    chain.stop();
  });

  it("asks no catch-up when the indexer gave no tip at boot, said, starts at the first round's tip, and still counts the day", async () => {
    const { chain, queries, log, following, nextRound, tipsAsked } = setup(
      [universe("onyx", "https://indexer.example.test/q")],
      [],
      serve({ tips: ["none", 7000, 7003], deploys: [deployAt(4999)] }),
    );
    await following();
    await vi.waitFor(() => {
      expect(tipsAsked()).toBe(2);
    });
    expect(catchUps(queries)).toHaveLength(0);
    expect(log).toHaveBeenCalledWith("chain_tip_unknown", { reason: "onyx" });
    expect(queries.some((query) => query.includes("heightAndIndex: DESC"))).toBe(true);
    await nextRound();
    await vi.waitFor(() => {
      expect(catchUps(queries)).toHaveLength(1);
    });
    expect(catchUps(queries)[0]).toContain("gt: 6999");
    chain.stop();
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
    // A file that cannot be read says which list and keeps the cause; a list that is no good says so otherwise.
    expect(() => readChainData("/nowhere/universes.json", hubs)).toThrow(
      "universes: /nowhere/universes.json cannot be read",
    );
    expect(() => readChainData(universes, "/nowhere/hubs.json")).toThrow("hubs: /nowhere/hubs.json cannot be read");
    expect(() => readChainData(universes, "/nowhere/hubs.json")).toThrow(
      expect.objectContaining({ cause: expect.any(Error) as unknown }),
    );
    const [good, badHubs] = files([universe("onyx", "https://indexer.example.test/q")], [{ slug: "<b>" }]);
    expect(() => readChainData(good, hubs)).not.toThrow();
    // Good universes with a hubs file that is no good: the hubs are judged, and named, not what they held.
    expect(() => readChainData(good, badHubs)).toThrow(badHubs);
    expect(() => readChainData(good, badHubs)).not.toThrow(/<b>/);
  });
});
