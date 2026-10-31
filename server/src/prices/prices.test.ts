import { Markets } from "@gnoworld/schemas";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { logger } from "../log.ts";
import { MAX_BYTES, startPrices } from "./prices.ts";

// CoinGecko's /simple/price as it answered on 2026-10-30 (api.coingecko.com, keyless, read in this session) for
// ids=bitcoin,gno-land,atomone with vs_currencies=usd, include_24hr_change and include_last_updated_at. An id it does
// not know is left out of the answer, not an error (nosuchcoin, same request).
const ANSWER = {
  bitcoin: { usd: 77454, usd_24h_change: -4.989185500145302, last_updated_at: 1793374805 },
  "gno-land": { usd: 0.058157, usd_24h_change: 0.23069061619450612, last_updated_at: 1793374816 },
  atomone: { usd: 0.083482, usd_24h_change: -8.156055900488774, last_updated_at: 1793374791 },
};
// The file's `updated` is the time of the READ (the server's clock), not CoinGecko's `last_updated_at`, which sits a day
// before it in this answer: a price that is stale shows its change as null, and the read's age is what the page says.
const NOW = Date.parse("2026-10-31T12:00:00.000Z");
const TOKENS = [
  { symbol: "GNOT", usd: 0.058157, change24h: 0.23069061619450612 },
  { symbol: "ATONE", usd: 0.083482, change24h: -8.156055900488774 },
  { symbol: "BTC", usd: 77454, change24h: -4.989185500145302 },
];

const dir = mkdtempSync(join(tmpdir(), "gnoworld-prices-"));
afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});
let n = 0;
const fresh = (): string => {
  n += 1;
  const folder = join(dir, `t${String(n)}`);
  mkdirSync(folder);
  return folder;
};
const running: { stop: () => void }[] = [];
afterEach(() => {
  for (const timer of running.splice(0)) timer.stop();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

interface Call {
  url: string;
  init: RequestInit;
  ms: number;
}
const json =
  (body: unknown, status = 200) =>
  () =>
    Promise.resolve(new Response(JSON.stringify(body), { status }));
const text =
  (body: string, status = 200) =>
  () =>
    Promise.resolve(new Response(body, { status }));

// The timer against a fake CoinGecko: `answers` one after another, the last one again once they run out.
function setup(answers: (() => Promise<Response>)[], options: { everyMs?: number; folder?: string } = {}) {
  const folder = options.folder ?? fresh();
  const file = join(folder, "markets.json");
  const calls: Call[] = [];
  const lines: string[] = [];
  const timer = startPrices({
    file,
    log: logger("a-pepper-of-forty-characters-0123456789", (line) => lines.push(line)),
    now: () => NOW,
    everyMs: options.everyMs ?? 60_000,
    send: (url, init, ms) => {
      calls.push({ url, init, ms });
      const answer = answers[Math.min(calls.length, answers.length) - 1];
      if (answer === undefined) throw new Error("no answer planned");
      return answer();
    },
  });
  running.push(timer);
  return { folder, file, calls, lines, timer };
}
const written = (file: string): string => readFileSync(file, "utf8");
const settled = async (calls: Call[], count: number): Promise<void> => {
  await vi.waitFor(() => {
    expect(calls).toHaveLength(count);
  });
};
// A tick ends by one of two signs, awaited and never slept on (F2750): its good answer, written as this read's
// (the clock is fixed at NOW, so a file of another time is not it yet), or its failure, logged.
const wrote = async (file: string): Promise<void> => {
  await vi.waitFor(() => {
    expect(JSON.parse(written(file))).toMatchObject({ updated: new Date(NOW).toISOString() });
  });
};
const failed = async (lines: string[], count = 1): Promise<void> => {
  await vi.waitFor(() => {
    expect(lines.length).toBeGreaterThanOrEqual(count);
  });
};
const kindOf = (line: string | undefined): unknown => (JSON.parse(line ?? "null") as { error?: unknown } | null)?.error;
const quiet = async (ms: number): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, ms));
};
const KEPT = `${JSON.stringify({ source: "CoinGecko", updated: "2026-10-31T11:55:00.000Z", tokens: [TOKENS[0]] })}\n`;
const withKept = () => {
  const folder = fresh();
  writeFileSync(join(folder, "markets.json"), KEPT);
  return folder;
};

describe("the prices timer: the request", () => {
  it("asks CoinGecko's keyless simple price for GNOT, ATONE and BTC in dollars with their 24 hour change", async () => {
    const { calls } = setup([json(ANSWER)]);
    await settled(calls, 1);
    const [{ url, init, ms }] = calls as [Call];
    const asked = new URL(url);
    expect(`${asked.origin}${asked.pathname}`).toBe("https://api.coingecko.com/api/v3/simple/price");
    expect([...(asked.searchParams.get("ids") ?? "").split(",")].sort()).toEqual(["atomone", "bitcoin", "gno-land"]);
    expect(asked.searchParams.get("vs_currencies")).toBe("usd");
    expect(asked.searchParams.get("include_24hr_change")).toBe("true");
    expect(init.method ?? "GET").toBe("GET");
    // No key: the free tier needs none (docs.coingecko.com/docs/errors-and-rate-limits), and a key is a secret.
    expect(url).not.toMatch(/api_key/i);
    const headers = [...new Headers(init.headers).keys()].join(" ");
    expect(headers).not.toMatch(/key|authorization|cookie/i);
    expect(ms).toBeGreaterThan(0);
    expect(ms).toBeLessThanOrEqual(10_000);
  });
});

describe("the prices timer: a good answer", () => {
  it("writes markets.json: the source, the time, the tokens in the video's order, valid to the schema", async () => {
    const { file } = setup([json(ANSWER)]);
    await wrote(file);
    const markets = Markets.parse(JSON.parse(written(file)));
    expect(markets).toEqual({ source: "CoinGecko", updated: "2026-10-31T12:00:00.000Z", tokens: TOKENS });
  });

  it("leaves out a coin CoinGecko has no price for, and a coin it does not list at all", async () => {
    const { file } = setup([json({ bitcoin: ANSWER.bitcoin, "gno-land": { usd_24h_change: 1 }, atomone: {} })]);
    await wrote(file);
    expect(Markets.parse(JSON.parse(written(file))).tokens).toEqual([TOKENS[2]]);
    const second = setup([json({ bitcoin: ANSWER.bitcoin })]);
    await wrote(second.file);
    expect(Markets.parse(JSON.parse(written(second.file))).tokens).toEqual([TOKENS[2]]);
  });

  it("leaves out a coin priced at zero or below, which is no price", async () => {
    const { file } = setup([
      json({ ...ANSWER, atomone: { usd: 0, usd_24h_change: 0 }, bitcoin: { usd: -5, usd_24h_change: 0 } }),
    ]);
    await wrote(file);
    expect(Markets.parse(JSON.parse(written(file))).tokens).toEqual([TOKENS[0]]);
  });

  it("keeps a priced coin whose 24 hour change CoinGecko leaves null (it does when stale), as null", async () => {
    const { file } = setup([json({ ...ANSWER, bitcoin: { usd: 77454, usd_24h_change: null } })]);
    await wrote(file);
    expect(Markets.parse(JSON.parse(written(file))).tokens[2]).toEqual({ symbol: "BTC", usd: 77454, change24h: null });
  });

  it("writes only the three coins asked for, whatever else the answer holds", async () => {
    const { file } = setup([
      json({ ...ANSWER, dogecoin: { usd: 1, usd_24h_change: 1 }, bitcoin: { ...ANSWER.bitcoin, note: "<b>hi</b>" } }),
    ]);
    await wrote(file);
    const content = written(file);
    expect(content).not.toMatch(/dogecoin|<b>|note/);
    expect(Markets.parse(JSON.parse(content)).tokens.map((token) => token.symbol)).toEqual(["GNOT", "ATONE", "BTC"]);
  });

  it("replaces the last file with a new one by renaming, so a reader never sees half a file", async () => {
    const folder = withKept();
    const file = join(folder, "markets.json");
    const before = statSync(file).ino;
    setup([json(ANSWER)], { folder });
    await wrote(file);
    expect(Markets.parse(JSON.parse(written(file))).tokens).toEqual(TOKENS);
    // A write in place keeps the file's inode; a rename brings another one.
    expect(statSync(file).ino).not.toBe(before);
    expect(readdirSync(folder)).toEqual(["markets.json"]);
  });

  it("creates the file when there is none, and leaves no temporary file next to it", async () => {
    const { folder, file } = setup([json(ANSWER)]);
    await wrote(file);
    expect(readdirSync(folder)).toEqual(["markets.json"]);
  });
});

const hostile = "<script>alert(1)</script>";
// Each failure: how it comes, and the kind the log gives it (the line's `error`), which is all it says.
const bad: [string, () => Promise<Response>, string][] = [
  ["a wrong shape: a list", json([ANSWER]), "shape"],
  ["a wrong shape: a string", json("bitcoin"), "shape"],
  ["a wrong shape: null", json(null), "shape"],
  ["a price as text", json({ ...ANSWER, bitcoin: { usd: "77454", usd_24h_change: 1 } }), "shape"],
  ["a price that is an object", json({ ...ANSWER, bitcoin: { usd: { v: 1 }, usd_24h_change: 1 } }), "shape"],
  ["a price that is null", json({ ...ANSWER, bitcoin: { usd: null, usd_24h_change: 1 } }), "shape"],
  ["a change as text", json({ ...ANSWER, "gno-land": { usd: 1, usd_24h_change: "up" } }), "shape"],
  ["a coin that is a number", json({ ...ANSWER, atomone: 5 }), "shape"],
  ["a hostile string for a price", json({ ...ANSWER, bitcoin: { usd: hostile, usd_24h_change: 1 } }), "shape"],
  ["a hostile string for a coin", json({ ...ANSWER, bitcoin: hostile }), "shape"],
  ["a price past what a number holds", text('{"bitcoin":{"usd":1e999,"usd_24h_change":1}}'), "shape"],
  ["no coin priced at all", json({}), "no_price"],
  ["every coin without a price", json({ bitcoin: {}, "gno-land": {}, atomone: {} }), "no_price"],
  ["a body that is not JSON", text("<html>Just a moment...</html>"), "not_json"],
  ["an empty body", text(""), "not_json"],
  ["a 204 with no body at all", () => Promise.resolve(new Response(null, { status: 204 })), "not_json"],
  ["a JSON body cut short", text('{"bitcoin":{"usd":774'), "not_json"],
  ["a huge answer", text(JSON.stringify({ ...ANSWER, pad: "x".repeat(1_000_000) })), "too_large"],
  ["a 429 Too Many Requests", text('{"status":{"error_code":429}}', 429), "rate_limited"],
  ["a 429 with a good body", json(ANSWER, 429), "rate_limited"],
  ["a 500", text("boom", 500), "status"],
  ["a 503", text("", 503), "status"],
  ["a 401", text("{}", 401), "status"],
  [
    "a redirect answer",
    () => Promise.resolve(new Response("", { status: 302, headers: { location: "https://evil.test/" } })),
    "status",
  ],
  [
    "an outage: the request rejects",
    () => Promise.reject(new Error("connect ECONNREFUSED 10.1.2.3:4750 boom")),
    "request",
  ],
  ["a timeout", () => Promise.reject(new DOMException("timed out", "TimeoutError")), "timeout"],
];
// What an answer or an error held, which no line may carry.
const NEVER_LOGGED = /script|Just a moment|boom|10\.1\.2\.3|ECONNREFUSED|evil\.test|<html|bitcoin|77454|timed out/i;

describe("the prices timer: a bad answer keeps the last file", () => {
  it.each(bad)(
    "keeps the file, byte for byte, and logs its kind and nothing it held, on %s",
    async (_, answer, kind) => {
      const folder = withKept();
      const { file, lines } = setup([answer], { folder });
      await failed(lines);
      expect(written(file)).toBe(KEPT);
      expect(readdirSync(folder)).toEqual(["markets.json"]);
      expect(kindOf(lines[0])).toBe(kind);
      expect(lines.join("")).not.toMatch(NEVER_LOGGED);
    },
  );

  it.each(bad)("creates no file when there was none, on %s", async (_, answer) => {
    const { folder, lines } = setup([answer]);
    await failed(lines);
    expect(readdirSync(folder)).toEqual([]);
  });

  it("reads no more than a capped part of an answer that never ends", async () => {
    let pulled = 0;
    const chunk = new Uint8Array(1024).fill(120);
    const endless = () =>
      Promise.resolve(
        new Response(
          new ReadableStream({
            pull(controller) {
              pulled += 1;
              controller.enqueue(chunk);
            },
          }),
          { status: 200 },
        ),
      );
    const folder = withKept();
    const { file, lines } = setup([endless], { folder });
    await failed(lines);
    // A cap of 64 KB is proposed; 200 KB is the most the test allows before it calls the answer unbounded.
    expect(pulled).toBeLessThanOrEqual(200);
    expect(written(file)).toBe(KEPT);
    expect(kindOf(lines[0])).toBe("too_large");
  });

  it("accepts a coin priced with no change key: its change is null, the answer is kept (F2760)", async () => {
    const { file } = setup([json({ bitcoin: { usd: 1 } })]);
    await wrote(file);
    expect(Markets.parse(JSON.parse(written(file))).tokens).toEqual([{ symbol: "BTC", usd: 1, change24h: null }]);
  });

  // A valid answer padded with spaces to an exact size: JSON allows whitespace around a value.
  const sized = (bytes: number) => text(JSON.stringify(ANSWER).padEnd(bytes, " "));

  it("takes an answer of exactly the cap and refuses one byte more (F2760)", async () => {
    const at = setup([sized(MAX_BYTES)]);
    await wrote(at.file);
    expect(Markets.parse(JSON.parse(written(at.file))).tokens).toEqual(TOKENS);
    const over = setup([sized(MAX_BYTES + 1)], { folder: withKept() });
    await failed(over.lines);
    expect(kindOf(over.lines[0])).toBe("too_large");
    expect(written(over.file)).toBe(KEPT);
  });

  it("recovers: a good answer after a bad one replaces the kept file", async () => {
    const folder = withKept();
    const { calls, file } = setup([text("", 503), json(ANSWER)], { folder, everyMs: 30 });
    await vi.waitFor(() => {
      expect(calls.length).toBeGreaterThanOrEqual(2);
    });
    await wrote(file);
    expect(Markets.parse(JSON.parse(written(file))).tokens).toEqual(TOKENS);
  });

  it("goes on after a write that fails (the folder is gone), logs it as such, and writes once it is back", async () => {
    const folder = fresh();
    const gone = join(folder, "later");
    const file = join(gone, "markets.json");
    const calls: Call[] = [];
    const lines: string[] = [];
    const timer = startPrices({
      file,
      log: logger("a-pepper-of-forty-characters-0123456789", (line) => lines.push(line)),
      now: () => NOW,
      everyMs: 30,
      send: (url, init, ms) => {
        calls.push({ url, init, ms });
        return json(ANSWER)();
      },
    });
    running.push(timer);
    await failed(lines, 2);
    expect(kindOf(lines[0])).toBe("write");
    expect(lines.join("")).not.toContain(folder);
    mkdirSync(gone);
    await wrote(file);
    expect(Markets.parse(JSON.parse(written(file))).tokens).toEqual(TOKENS);
  });

  it("leaves no temporary file when the rename fails after it was written, and goes on", async () => {
    // markets.json is a folder: the temp file is written, then cannot take its place.
    const folder = fresh();
    mkdirSync(join(folder, "markets.json"));
    const { lines } = setup([json(ANSWER)], { folder, everyMs: 30 });
    await failed(lines, 2);
    expect(kindOf(lines[0])).toBe("write");
    expect(readdirSync(folder)).toEqual(["markets.json"]);
  });

  it("goes on after a send that throws at once instead of rejecting", async () => {
    const { calls, lines } = setup(
      [
        () => {
          throw new Error("sync");
        },
        json(ANSWER),
      ],
      { everyMs: 30 },
    );
    await vi.waitFor(() => {
      expect(calls.length).toBeGreaterThanOrEqual(2);
    });
    expect(kindOf(lines[0])).toBe("request");
  });

  it.each([
    ["a 429", text("", 429)],
    ["a 500", text("", 500)],
    ["a request that fails", () => Promise.reject(new Error("down"))],
  ])(
    "waits the whole interval after %s, never a quick retry (every request counts toward CoinGecko's limit)",
    async (_, answer) => {
      const { calls, lines } = setup([answer, json(ANSWER)], { everyMs: 60_000 });
      await failed(lines);
      await quiet(300);
      expect(calls).toHaveLength(1);
    },
  );
});

describe("the prices timer: its own way out, with no send given", () => {
  it("goes out by the server's send: CoinGecko's address, a timeout, no redirect followed, and writes a good answer", async () => {
    const fetched = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(() => json(ANSWER)());
    vi.stubGlobal("fetch", fetched);
    const folder = fresh();
    const file = join(folder, "markets.json");
    running.push(
      startPrices({ file, log: logger("a-pepper-of-forty-characters-0123456789", () => undefined), now: () => NOW }),
    );
    await wrote(file);
    expect(fetched).toHaveBeenCalledTimes(1);
    const [url, init] = fetched.mock.calls[0] ?? [];
    expect(String(url)).toMatch(/^https:\/\/api\.coingecko\.com\/api\/v3\/simple\/price\?/);
    expect(init?.redirect).toBe("error");
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("ends a request that never answers, and a body that stalls, within its timeout (10 s at most)", async () => {
    const real = AbortSignal.timeout.bind(AbortSignal);
    const asked: number[] = [];
    vi.spyOn(AbortSignal, "timeout").mockImplementation((ms: number) => {
      asked.push(ms);
      return real(40);
    });
    // fetch as the platform does: an abort rejects a request that waits, and errors a body being read.
    let calls = 0;
    vi.stubGlobal("fetch", (_url: string, init: RequestInit) => {
      calls += 1;
      const signal = init.signal ?? AbortSignal.abort();
      if (calls === 1) {
        return new Promise<Response>((_, reject) => {
          signal.addEventListener("abort", () => {
            reject(new DOMException("aborted", "TimeoutError"));
          });
        });
      }
      return Promise.resolve(
        new Response(
          new ReadableStream({
            start(controller) {
              signal.addEventListener("abort", () => {
                controller.error(new DOMException("aborted", "TimeoutError"));
              });
            },
          }),
        ),
      );
    });
    const folder = withKept();
    const file = join(folder, "markets.json");
    const lines: string[] = [];
    running.push(
      startPrices({
        file,
        log: logger("a-pepper-of-forty-characters-0123456789", (line) => lines.push(line)),
        now: () => NOW,
        everyMs: 30,
      }),
    );
    await failed(lines, 2);
    expect(calls).toBeGreaterThanOrEqual(2);
    expect(asked.length).toBeGreaterThan(0);
    for (const ms of asked) expect(ms).toBeLessThanOrEqual(10_000);
    expect(written(file)).toBe(KEPT);
  });
});

describe("the prices timer: when it runs", () => {
  it.each([
    ["a good answer", json(ANSWER)],
    ["a 429", text("", 429)],
    ["a request that fails", () => Promise.reject(new Error("down"))],
  ])("reads at start, then every five minutes by default, after %s as after any", async (_, answer) => {
    const delays: number[] = [];
    const real = globalThis.setTimeout;
    vi.spyOn(globalThis, "setTimeout").mockImplementation((fn: () => void, ms?: number) => {
      delays.push(ms ?? 0);
      return real(fn, ms !== undefined && ms >= 300_000 ? 3_600_000 : ms);
    });
    const calls: Call[] = [];
    const timer = startPrices({
      file: join(fresh(), "markets.json"),
      log: logger("a-pepper-of-forty-characters-0123456789", () => undefined),
      now: () => NOW,
      send: (url, init, ms) => {
        calls.push({ url, init, ms });
        return answer();
      },
    });
    running.push(timer);
    await vi.waitFor(() => {
      expect(calls).toHaveLength(1);
      expect(delays).toContain(300_000);
    });
    // Not a minute, not ten: the cost in the plan is one request every 5 minutes.
    expect(delays.filter((ms) => ms >= 1000)).toEqual([300_000]);
  });

  it("does not start a second request while the first has not answered", async () => {
    let release: (response: Response) => void = () => undefined;
    const slow = () =>
      new Promise<Response>((resolve) => {
        release = resolve;
      });
    const { calls, file } = setup([slow, json(ANSWER)], { everyMs: 20 });
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(calls).toHaveLength(1);
    release(new Response(JSON.stringify(ANSWER), { status: 200 }));
    await vi.waitFor(() => {
      expect(calls.length).toBeGreaterThanOrEqual(2);
    });
    expect(Markets.parse(JSON.parse(written(file))).tokens).toEqual(TOKENS);
  });

  it("waits its interval after an answer, not before: the next read comes everyMs after the last one ENDED", async () => {
    const starts: number[] = [];
    const ends: number[] = [];
    const { calls } = setup(
      [
        () => {
          starts.push(Date.now());
          return new Promise((resolve) => {
            setTimeout(() => {
              ends.push(Date.now());
              resolve(new Response("{}", { status: 200 }));
            }, 120);
          });
        },
      ],
      { everyMs: 100 },
    );
    await vi.waitFor(() => {
      expect(calls.length).toBeGreaterThanOrEqual(2);
    });
    const [firstEnd] = ends as [number];
    const [, secondStart] = starts as [number, number];
    // A timer measured from the start of a read (with a guard against overlap) would come 80 ms after the end.
    // Measured from the end it comes after 100, less a timer's slack.
    expect(secondStart - firstEnd).toBeGreaterThanOrEqual(95);
  });

  it("stops: no request after stop(), with a timer pending", async () => {
    const { calls, file, timer } = setup([json(ANSWER)], { everyMs: 100 });
    // The first read has ended and the next is waiting on its timer: this is the state stop() must cancel.
    await wrote(file);
    timer.stop();
    const count = calls.length;
    await quiet(250);
    expect(calls).toHaveLength(count);
  });

  it("stops with a request in flight: its answer, arriving after, writes nothing and starts nothing", async () => {
    let release: (response: Response) => void = () => undefined;
    const slow = () =>
      new Promise<Response>((resolve) => {
        release = resolve;
      });
    const folder = withKept();
    const { calls, file, timer } = setup([slow, json(ANSWER)], { folder, everyMs: 20 });
    await vi.waitFor(() => {
      expect(calls).toHaveLength(1);
    });
    timer.stop();
    release(new Response(JSON.stringify(ANSWER), { status: 200 }));
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(written(file)).toBe(KEPT);
    expect(calls).toHaveLength(1);
  });
});

// The timer's way out (slice 5 part 2, 5l; decision 151; threat model "server's way out"): the proxy lets out the hosts
// its list names, so the list is what keeps the timer from reaching any other. deploy/test.sh proves it on the running
// stack; this reads the files, where Docker is not needed.
const read = (path: string): string => readFileSync(new URL(path, import.meta.url), "utf8");

describe("the egress proxy's list", () => {
  // The block height (decision of 2026-10-31) adds one host, the default universe's RPC; universes.test.ts ties it to the data.
  it("lets out CoinGecko's API, OpenAI's and the default universe's RPC, and no other host", () => {
    const acl = read("../../../deploy/egress/acl.yaml");
    const hosts = [...acl.matchAll(/^\s+-\s+(\S+)\s*$/gm)].map((match) => match[1]);
    expect(hosts).toEqual(["api.coingecko.com", "api.openai.com", "rpc.onyx.testnets.gno.land"]);
  });

  it("names CoinGecko by the API's own name, never a wildcard or its parent domain", () => {
    const acl = read("../../../deploy/egress/acl.yaml");
    expect(acl).not.toMatch(/\*|^\s+-\s+(coingecko\.com|"?\.coingecko)/m);
  });
});

describe("the stack", () => {
  const compose = read("../../../deploy/compose.yaml");

  it("tells the server where to write markets.json", () => {
    expect(compose).toMatch(/^\s+MARKETS_FILE: \/\S+\/markets\.json\s*$/m);
  });

  it("keeps markets.json in a named volume the server writes: read-write, declared, not /tmp, not the root", () => {
    const file = /^\s+MARKETS_FILE: (\/\S+)\/markets\.json\s*$/m.exec(compose)?.[1];
    expect(file).toBeDefined();
    // The server's root is read-only and /tmp is a tmpfs: a file there is lost at a restart and no one else sees it.
    expect(file).not.toMatch(/^\/(tmp(\/|$)|etc(\/|$)|)$/);
    const server = /^ {2}server:\n([\s\S]*?)(?=^ {2}\S)/m.exec(compose)?.[1] ?? "";
    const mount = new RegExp(`^\\s+- (\\w+):${file ?? ""}\\s*$`, "m").exec(server);
    expect(mount).not.toBeNull();
    // A named volume, declared at the top, and no :ro (the line ends with the folder).
    expect(compose).toMatch(new RegExp(`^volumes:\\n(?:.*\\n)*? {2}${mount?.[1] ?? "?"}: \\{\\}`, "m"));
  });

  it("makes the folder for the server's user in its image, so the volume starts writable by it", () => {
    const docker = read("../../../deploy/server/Dockerfile");
    expect(docker).toMatch(/chown 65532:65532 [^\n]*\/markets/);
    expect(docker).toMatch(/COPY --from=build --chown=65532:65532 \/markets \/markets/);
  });

  it("gives the server no key for CoinGecko: the free tier needs none", () => {
    expect(compose).not.toMatch(/coingecko[_-]?(api[_-]?)?key|x[_-]cg/i);
  });
});

describe("deploy/test.sh", () => {
  const script = read("../../../deploy/test.sh");

  it("expects the way out's list to be exactly CoinGecko's API, OpenAI's and the default universe's RPC", () => {
    expect(script).toMatch(/printf '%s\\n' api\.coingecko\.com api\.openai\.com "\$rpc_host"/);
  });

  it("checks the server may write in the folder of markets.json, on its read-only root", () => {
    expect(script).toMatch(/the server may write in the folder of markets\.json/);
  });

  it("names its mutants by checks that exist: the renamed one cannot be orphaned (F695)", () => {
    expect(script).not.toContain("lets one host out");
    for (const wanted of ["the way out lets three hosts out", "the server does not reach CoinGecko"]) {
      // Once in a mutant that must be killed by the check, once in the check itself.
      expect(script.split(wanted).length - 1, wanted).toBeGreaterThanOrEqual(2);
    }
  });

  it("has a mutant for CoinGecko's line dropped and one for its whole domain let out", () => {
    expect(script).toMatch(
      /^\s+mutant "[^"]*" "the server does not reach CoinGecko" acl sed '\/- api\.coingecko\.com\/d'/m,
    );
    expect(script).toMatch(/\*\.coingecko\.com/);
  });

  it("checks the server reaches CoinGecko through the way out, and still nothing else", () => {
    expect(script).toMatch(/fetched 'https:\/\/api\.coingecko\.com\/api\/v3\/simple\/price/);
    expect(script).toMatch(/https:\/\/api\.coingecko\.com\.evil\.test\//);
    expect(script).toMatch(/the server reaches CoinGecko/);
  });
});

// The home's block height (decision of 2026-10-31, "je valide tes reco"; morning.md, point 17): the same timer reads the default
// universe's height from its RPC through the server's one way out, and writes it with the prices, so no visitor's browser asks an
// RPC. The envelope is the one app/tests/chain/chainEnvelopes.ts writes from gno's source (`statusEnvelope`).
const RPC = "https://rpc.onyx.testnets.gno.land:443";
// The default port is dropped from the address asked: the origin as a URL writes it.
const STATUS_URL = "https://rpc.onyx.testnets.gno.land/status";
const BLOCK_TIME = "2026-10-31T11:59:10.123456789Z";
const status = (height: string | number, time: string = BLOCK_TIME) => ({
  jsonrpc: "2.0",
  id: "",
  result: {
    sync_info: {
      latest_block_hash: "",
      latest_app_hash: "",
      latest_block_height: String(height),
      latest_block_time: time,
      catching_up: false,
    },
    build_version: "",
  },
});
const BLOCK = { height: 786661, time: BLOCK_TIME, host: "rpc.onyx.testnets.gno.land" };

// The timer with an RPC, each URL answered by its own plan: the prices' and the status'.
function withRpc(
  {
    prices = json(ANSWER),
    height = json(status(786661)),
  }: { prices?: () => Promise<Response>; height?: () => Promise<Response> },
  options: { everyMs?: number; folder?: string; rpc?: string } = {},
) {
  const folder = options.folder ?? fresh();
  const file = join(folder, "markets.json");
  const calls: Call[] = [];
  const lines: string[] = [];
  const timer = startPrices({
    file,
    rpc: options.rpc ?? RPC,
    log: logger("a-pepper-of-forty-characters-0123456789", (line) => lines.push(line)),
    now: () => NOW,
    everyMs: options.everyMs ?? 60_000,
    send: (url, init, ms) => {
      calls.push({ url, init, ms });
      return url.startsWith("https://api.coingecko.com/") ? prices() : height();
    },
  });
  running.push(timer);
  return { folder, file, calls, lines, timer };
}
const heightLogged = (lines: string[]): string[] =>
  lines
    .map((line) => JSON.parse(line) as { event: string; error?: string })
    .filter((line) => line.event === "height_failed")
    .map((line) => line.error ?? "");

describe("the prices timer: the block height", () => {
  it("asks the RPC's /status once beside the prices, by GET, with a time limit, and nothing else of it", async () => {
    const { calls, file } = withRpc({});
    await wrote(file);
    expect(calls.map(({ url }) => url).filter((url) => !url.startsWith("https://api.coingecko.com/"))).toEqual([
      STATUS_URL,
    ]);
    const call = calls.find(({ url }) => url === STATUS_URL);
    expect(call?.init.method ?? "GET").toBe("GET");
    expect(call?.ms).toBeGreaterThan(0);
    expect(call?.ms).toBeLessThanOrEqual(10_000);
    expect([...new Headers(call?.init.headers).keys()].join(" ")).not.toMatch(/key|authorization|cookie/i);
  });

  it("writes the height, its block's time and the RPC's host in markets.json beside the prices, valid to the schema", async () => {
    const { file } = withRpc({});
    await wrote(file);
    expect(Markets.parse(JSON.parse(written(file)))).toEqual({
      source: "CoinGecko",
      updated: "2026-10-31T12:00:00.000Z",
      tokens: TOKENS,
      block: BLOCK,
    });
  });

  it("asks no RPC without one: the file is the prices alone", async () => {
    const { calls, file } = setup([json(ANSWER)]);
    await wrote(file);
    expect(calls).toHaveLength(1);
    expect(JSON.parse(written(file))).not.toHaveProperty("block");
  });

  it("reads both again every interval, on the one timer", async () => {
    const { calls } = withRpc({}, { everyMs: 30 });
    await vi.waitFor(() => {
      expect(calls.length).toBeGreaterThanOrEqual(4);
    });
    expect(calls.filter(({ url }) => url === STATUS_URL).length).toBeGreaterThanOrEqual(2);
    expect(calls.filter(({ url }) => url !== STATUS_URL).length).toBeGreaterThanOrEqual(2);
  });

  // A failed height keeps the prices and leaves the height out, logged by its kind.
  it.each([
    ["a 503", () => Promise.resolve(new Response("down", { status: 503 })), "status"],
    ["a request that fails", () => Promise.reject(new Error("secret-detail-https://x.test")), "request"],
    ["a body that is no JSON", text("<html>"), "not_json"],
    ["a body of another shape", json({ result: {} }), "shape"],
    ["a height of zero", json(status(0)), "shape"],
    ["a height past the bound", json(status(1e12 + 1)), "shape"],
    ["a height that is no number", json(status("12ab")), "shape"],
    ["a block time that is no time", json(status(5, "yesterday")), "shape"],
    ["an answer over the cap", () => Promise.resolve(new Response("x".repeat(MAX_BYTES + 1))), "too_large"],
  ])("keeps the prices and leaves the height out after %s", async (_, height, kind) => {
    const { file, lines } = withRpc({ height });
    await wrote(file);
    const markets = Markets.parse(JSON.parse(written(file)));
    expect(markets.tokens).toEqual(TOKENS);
    expect(markets.block).toBeUndefined();
    expect(heightLogged(lines)).toEqual([kind]);
    expect(lines.join("")).not.toMatch(/secret-detail|x\.test|<html>|12ab/);
  });

  it("takes an answer of exactly the cap and refuses one byte more", async () => {
    const pad = (size: number) => {
      const base = JSON.stringify({ ...status(786661), pad: "" });
      return base.replace('"pad":""', `"pad":"${"x".repeat(size - base.length + 0)}"`);
    };
    const exact = pad(MAX_BYTES);
    expect(exact.length).toBe(MAX_BYTES);
    const ok = withRpc({ height: text(exact) });
    await wrote(ok.file);
    expect(Markets.parse(JSON.parse(written(ok.file))).block).toEqual(BLOCK);
    const over = withRpc({ height: text(pad(MAX_BYTES + 1)) });
    await wrote(over.file);
    expect(Markets.parse(JSON.parse(written(over.file))).block).toBeUndefined();
  });

  it("drops the last file's height when this read cannot get one, never keeping a stale block beside fresh prices", async () => {
    const folder = fresh();
    writeFileSync(
      join(folder, "markets.json"),
      `${JSON.stringify({ source: "CoinGecko", updated: "2026-10-31T11:55:00.000Z", tokens: [TOKENS[0]], block: { ...BLOCK, height: 5 } })}\n`,
    );
    const { file } = withRpc({ height: text("nope") }, { folder });
    await wrote(file);
    expect(Markets.parse(JSON.parse(written(file))).block).toBeUndefined();
  });

  it("keeps the last file whole when the prices fail, a good height or not", async () => {
    const folder = withKept();
    const { lines } = withRpc({ prices: text("", 500) }, { folder });
    await failed(lines);
    expect(readFileSync(join(folder, "markets.json"), "utf8")).toBe(KEPT);
  });

  it("goes out only to the RPC it was given and to CoinGecko: any other host is never asked", async () => {
    const { calls, file } = withRpc({}, { rpc: "https://rpc.other.example:8443/" });
    await wrote(file);
    const hosts = new Set(calls.map(({ url }) => new URL(url).host));
    expect(hosts).toEqual(new Set(["api.coingecko.com", "rpc.other.example:8443"]));
    expect(calls.find(({ url }) => url.includes("rpc.other"))?.url).toBe("https://rpc.other.example:8443/status");
    expect(Markets.parse(JSON.parse(written(file))).block?.host).toBe("rpc.other.example");
  });

  it.each([
    "http://rpc.onyx.example",
    "rpc.onyx.example",
    "https://u:p@rpc.onyx.example",
    "https://rpc.example/x?y#z",
    "",
  ])("refuses to start with an RPC that is no bare https address: %j", (rpc) => {
    expect(() =>
      startPrices({
        file: join(fresh(), "markets.json"),
        rpc,
        log: () => undefined,
        send: () => new Promise(() => undefined),
      }),
    ).toThrow(/rpc/);
  });
});
