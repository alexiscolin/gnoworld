import { readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { type Nginx, serveImage } from "../../../tests/nginx.ts";
import type { Fetcher } from "./http.ts";
import { MARKETS_MAX_BYTES, readMarkets } from "./markets.ts";

// Slice 5m: the browser's one read of markets.json, the file 5l's timer writes and nginx serves at /markets.json. The page
// shows what the file says or a state; it never shows a price the schema refused, and never a state that hides which one it is.
const GOOD = {
  source: "CoinGecko",
  updated: "2026-10-31T06:00:00.000Z",
  tokens: [
    { symbol: "GNOT", usd: 1.23, change24h: 2.5 },
    { symbol: "BTC", usd: 67000.5, change24h: null },
  ],
};
const answering = (body: unknown, init?: ResponseInit) =>
  vi.fn<Fetcher>(() => Promise.resolve(new Response(typeof body === "string" ? body : JSON.stringify(body), init)));

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("readMarkets", () => {
  it("asks this site's /markets.json once, by GET, and never follows a redirect", async () => {
    const fetcher = answering(GOOD);
    await readMarkets(fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0] ?? [];
    expect(url).toBe("/markets.json");
    expect(init?.method ?? "GET").toBe("GET");
    expect(init?.redirect).toBe("error");
    expect(init?.credentials).toBe("same-origin");
  });

  it("refuses at once on a declared length past the cap, reading no body", async () => {
    const pulls = vi.fn();
    const body = new ReadableStream<Uint8Array>({ pull: pulls }, { highWaterMark: 0 });
    const big = vi.fn<Fetcher>(() =>
      Promise.resolve(new Response(body, { headers: { "content-length": String(MARKETS_MAX_BYTES + 1) } })),
    );
    expect(await readMarkets(big)).toEqual({ ok: false, reason: "malformed" });
    expect(pulls).not.toHaveBeenCalled();
  });

  it("frees the connection of an answer it does not read", async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      cancel() {
        cancelled = true;
      },
    });
    const down = vi.fn<Fetcher>(() => Promise.resolve(new Response(body, { status: 502 })));
    expect(await readMarkets(down)).toEqual({ ok: false, reason: "unavailable" });
    expect(cancelled).toBe(true);
  });

  it("says unavailable on any 2xx that is not a 200: the file is not what the timer writes", async () => {
    expect(await readMarkets(answering(JSON.stringify(GOOD), { status: 206 }))).toEqual({
      ok: false,
      reason: "unavailable",
    });
  });

  it("gives the file's markets when it holds the schema's shape, tokens that have a price only", async () => {
    const result = await readMarkets(answering(GOOD));
    expect(result).toEqual({ ok: true, markets: GOOD });
  });

  it("gives a file with no token as a valid read: the source answered, nothing has a price", async () => {
    const result = await readMarkets(answering({ ...GOOD, tokens: [] }));
    expect(result).toEqual({ ok: true, markets: { ...GOOD, tokens: [] } });
  });

  it("says the file is missing on a 404, not that it is broken", async () => {
    expect(await readMarkets(answering("not found", { status: 404 }))).toEqual({ ok: false, reason: "missing" });
  });

  it("says the file is missing when the host answers its HTML fallback with a 404", async () => {
    const fallback = answering("<!doctype html><title>gno.world</title>", { status: 404 });
    expect(await readMarkets(fallback)).toEqual({ ok: false, reason: "missing" });
  });

  it("says unavailable on a server error", async () => {
    expect(await readMarkets(answering("", { status: 502 }))).toEqual({ ok: false, reason: "unavailable" });
  });

  it("says network when the request fails", async () => {
    const down = vi.fn<Fetcher>(() => Promise.reject(new TypeError("Failed to fetch")));
    expect(await readMarkets(down)).toEqual({ ok: false, reason: "network" });
  });

  it("says network, and leaves no timer, when the answer never comes", async () => {
    const never = vi.fn<Fetcher>(() => new Promise<Response>(() => undefined));
    const pending = readMarkets(never);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(await pending).toEqual({ ok: false, reason: "network" });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("says malformed on text that is no JSON, and on an answer the page's HTML fallback gave with a 200", async () => {
    expect(await readMarkets(answering("{"))).toEqual({ ok: false, reason: "malformed" });
    expect(await readMarkets(answering("<!doctype html><html></html>"))).toEqual({ ok: false, reason: "malformed" });
  });

  it.each([
    ["a source that is not CoinGecko", { ...GOOD, source: "Somebody" }],
    ["a time that is no time", { ...GOOD, updated: "yesterday" }],
    ["a token the row does not know", { ...GOOD, tokens: [{ symbol: "DOGE", usd: 1, change24h: null }] }],
    ["a price of zero", { ...GOOD, tokens: [{ symbol: "GNOT", usd: 0, change24h: null }] }],
    ["a negative price", { ...GOOD, tokens: [{ symbol: "GNOT", usd: -1, change24h: null }] }],
    ["a price as text", { ...GOOD, tokens: [{ symbol: "GNOT", usd: "1.23", change24h: null }] }],
    ["a field it does not know", { ...GOOD, extra: true }],
    ["a token twice", { ...GOOD, tokens: [GOOD.tokens[0], GOOD.tokens[0]] }],
    ["tokens out of the video's order", { ...GOOD, tokens: [GOOD.tokens[1], GOOD.tokens[0]] }],
    ["no tokens field", { source: GOOD.source, updated: GOOD.updated }],
  ])("says malformed, and keeps none of it, for %s", async (_what, body) => {
    expect(await readMarkets(answering(body))).toEqual({ ok: false, reason: "malformed" });
  });

  it.each([
    { what: "an empty answer", body: "", status: 200, reason: "malformed" },
    {
      what: "the demo's password asked for (401)",
      body: "<html>Unauthorized</html>",
      status: 401,
      reason: "unavailable",
    },
    { what: "a forbidden (403)", body: "", status: 403, reason: "unavailable" },
    { what: "too many requests (429)", body: "", status: 429, reason: "unavailable" },
  ] as const)("says $what is $reason, whatever the body holds", async ({ body, status, reason }) => {
    expect(await readMarkets(answering(body, { status }))).toEqual({ ok: false, reason });
  });

  it("says unavailable on no content (204): the file is not what the timer writes", async () => {
    const nothing = vi.fn<Fetcher>(() => Promise.resolve(new Response(null, { status: 204 })));
    expect(await readMarkets(nothing)).toEqual({ ok: false, reason: "unavailable" });
  });

  it("says network, and leaves no timer, when the headers come and the body never ends", async () => {
    const stalled = new ReadableStream<Uint8Array>({ pull: () => new Promise<void>(() => undefined) });
    const pending = readMarkets(vi.fn<Fetcher>(() => Promise.resolve(new Response(stalled, { status: 200 }))));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(await pending).toEqual({ ok: false, reason: "network" });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("accepts a body of exactly the cap and refuses one byte more, padding included", async () => {
    const json = JSON.stringify(GOOD);
    const at = (bytes: number) => `${json}${" ".repeat(bytes - json.length)}`;
    expect(await readMarkets(answering(at(MARKETS_MAX_BYTES)))).toEqual({ ok: true, markets: GOOD });
    expect(await readMarkets(answering(at(MARKETS_MAX_BYTES + 1)))).toEqual({ ok: false, reason: "malformed" });
    expect(await readMarkets(answering(at(256 * 1024)))).toEqual({ ok: false, reason: "malformed" });
  });

  it("stops reading an endless body at the cap, and says malformed", async () => {
    let pulled = 0;
    const endless = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled += 1;
        controller.enqueue(new Uint8Array(1024).fill(32));
      },
    });
    const result = await readMarkets(vi.fn<Fetcher>(() => Promise.resolve(new Response(endless, { status: 200 }))));
    expect(result).toEqual({ ok: false, reason: "malformed" });
    expect(pulled).toBeLessThan(MARKETS_MAX_BYTES / 1024 + 8);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("ends the request, and leaves no timer, when its caller's signal aborts", async () => {
    const seen: (AbortSignal | null | undefined)[] = [];
    const never = vi.fn<Fetcher>((_url, init) => {
      seen.push(init?.signal);
      return new Promise<Response>(() => undefined);
    });
    const controller = new AbortController();
    const pending = readMarkets(never, { signal: controller.signal });
    controller.abort();
    expect(await pending).toEqual({ ok: false, reason: "network" });
    expect(seen[0]?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("asks nothing when its caller's signal is already aborted", async () => {
    const never = vi.fn<Fetcher>(() => new Promise<Response>(() => undefined));
    expect(await readMarkets(never, { signal: AbortSignal.abort() })).toEqual({ ok: false, reason: "network" });
    expect(never).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});

// How markets.json reaches the page (5m, tier 1): the volume read-only on web, a location, a short cache. The compose and
// test.sh checks read text, so Alexis's run of deploy/test.sh is their proof; the nginx ones ask the pinned nginx.
const read = (path: string) => readFileSync(new URL(`../../../../${path}`, import.meta.url), "utf8");
const compose = read("deploy/compose.yaml");
const conf = read("deploy/web/nginx.conf");
const script = read("deploy/test.sh");

/** The body of a service in the compose file, from its name to the next service. */
const service = (name: string) => new RegExp(`^ {2}${name}:\\n([\\s\\S]*?)(?=^ {2}\\S)`, "m").exec(compose)?.[1] ?? "";
/** The body of a location block of the server, braces counted. */
function location(header: RegExp): string {
  const start = header.exec(conf);
  if (start === null) return "";
  let depth = 0;
  for (let at = start.index + start[0].length - 1; at < conf.length; at += 1) {
    if (conf[at] === "{") depth += 1;
    if (conf[at] === "}" && --depth === 0) return conf.slice(start.index, at + 1);
  }
  return "";
}

describe("the web service's volume", () => {
  it("mounts the markets volume the server writes, and only reads it", () => {
    expect(service("web")).toMatch(/^\s+- markets:\/markets:ro\s*$/m);
  });

  it("is the one volume the server writes: declared once, mounted read-write by the server alone", () => {
    expect(compose).toMatch(/^volumes:\n(?:.*\n)*? {2}markets: \{\}/m);
    const mounting = ["web", "ergo", "server", "guard", "egress", "tailscale"].filter((name) =>
      /^\s+- markets:\/markets\s*$/m.test(service(name)),
    );
    expect(mounting).toEqual(["server"]);
  });
});

describe("the web image's nginx, read", () => {
  const block = location(/location\s*=\s*\/markets\.json\s*\{/);

  it("has a location for that exact path, from the mounted folder", () => {
    expect(block).not.toBe("");
    expect(block).toMatch(/\b(root\s+\/markets;|alias\s+\/markets\/markets\.json;)/);
    expect(block).not.toMatch(/add_header/);
    expect(block).toMatch(/disable_symlinks\s+on\s+from=\$document_root;/);
    expect(conf.match(/location\s*=\s*\/markets\.json/g) ?? []).toHaveLength(1);
  });

  it("keeps the build's other rules: the hashed assets' year, the API's own headers, the password and the limits", () => {
    expect(conf).toMatch(/~\^\(200\|206\|304\)\/assets\/ "public, max-age=31536000, immutable";/);
    expect(conf).toContain("auth_basic ");
    expect(conf).toContain("limit_req zone=visitors");
  });
});

// The pinned nginx on the image's config, asked for the file: what a browser gets, not what the config says.
describe("the web image's nginx, served", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });
  let nginx: Nginx;
  beforeAll(async () => {
    nginx = await serveImage();
  }, 30_000);
  afterAll(() => {
    nginx.stop();
  });

  it("serves a file the server wrote at /markets.json, kept a short time, never sniffed, with a policy", async () => {
    writeFileSync(
      nginx.markets,
      JSON.stringify({ source: "CoinGecko", updated: "2026-10-31T06:00:00.000Z", tokens: [] }),
    );
    const answer = await nginx.get("/markets.json");
    expect(answer.status).toBe(200);
    expect(JSON.parse(answer.body)).toMatchObject({ source: "CoinGecko" });
    const cache = answer.headers.get("cache-control") ?? "";
    expect(cache).not.toMatch(/immutable|no-store|no-cache/);
    const age = Number(/max-age=(\d+)/.exec(cache)?.[1]);
    expect(age).toBeGreaterThanOrEqual(1);
    expect(age).toBeLessThanOrEqual(300);
    expect(answer.headers.get("x-content-type-options")).toBe("nosniff");
    expect(answer.headers.get("content-security-policy")).toBeTruthy();
    expect(answer.headers.get("x-robots-tag")).toBe("noindex");
    expect(answer.headers.get("content-type")).toMatch(/^application\/json/);
  });

  it("answers a 404, never the page's fallback as a 200, when the file is absent", async () => {
    rmSync(nginx.markets, { force: true });
    const answer = await nginx.get("/markets.json");
    expect(answer.status).toBe(404);
    expect(answer.headers.get("cache-control")).toBe("no-cache");
    expect(answer.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("does not follow a link planted in the volume: the server's code can write there, web's secrets are not its to read", async () => {
    writeFileSync(nginx.outside, "team:$apr1$secrethash");
    rmSync(nginx.markets, { force: true });
    symlinkSync(nginx.outside, nginx.markets);
    const answer = await nginx.get("/markets.json");
    expect(answer.status).toBe(404);
    expect(answer.body).not.toContain("secrethash");
    rmSync(nginx.markets, { force: true });
  });

  it("serves that path alone: another file of the folder is not reachable", async () => {
    writeFileSync(nginx.markets.replace("markets.json", "other.json"), "{}");
    expect((await nginx.get("/other.json")).status).toBe(404);
    expect((await nginx.get("/markets.json/")).status).toBe(404);
  });
});

/** The lines of deploy/test.sh that call `word` (expect, mutant, ...) with a name that starts so: a name in a comment is no call. */
const calls = (word: string, name: string) =>
  script.split("\n").filter((line) => new RegExp(`^\\s*${word} "${name.replace(/[.]/g, "\\.")}`).test(line));

describe("deploy/test.sh", () => {
  it("checks, as calls, that web serves markets.json with a short cache, never sniffed", () => {
    expect(calls("expect", "web serves markets.json from the volume")).toHaveLength(1);
    const cache = calls("expect", "web serves markets.json with a short cache")[0] ?? "";
    expect(cache).toMatch(/header cache-control \/markets\.json/);
    expect(cache).toMatch(/max-age=([1-9]\d?\d?)\b/);
    expect(calls("expect", "web serves markets.json never sniffed")[0]).toMatch(
      /header x-content-type-options \/markets\.json.*nosniff/,
    );
  });

  it("checks, as a call, that web's mount of the markets volume is read-only, and the volume the server's", () => {
    expect(script).toMatch(
      /expect "web cannot write in the folder of markets\.json" \\\n[^\n]*Destination "\/markets"[^\n]*\{\{\.RW\}\}[^\n]*"\$web"\)" false\n/,
    );
    expect(calls("expect", "and it is the volume the server writes")[0]).toMatch(
      /mounted "\$web" \/markets\).*mounted "\$server" \/markets\)/,
    );
  });

  it("checks, as calls, the password on markets.json and a link planted in its volume", () => {
    expect(calls("expect", "web serves markets.json only with the password")[0]).toMatch(
      /status \/markets\.json [0-9.]+\)" 401/,
    );
    const link = calls("expect", "web does not follow a link planted in the markets volume")[0] ?? "";
    expect(link).toMatch(/404$/);
    expect(script).toMatch(/symlinkSync\('\/etc\/nginx\/nginx\.conf', '\/markets\/markets\.json'\)/);
  });

  it("plants the password dropped on the location and the link followed, each killed by a check that is a call", () => {
    const open = calls("mutant", "markets.json open without the password")[0] ?? "";
    expect(open).toContain('"web serves markets.json only with the password"');
    expect(script).toMatch(/location = \\\/markets\\\.json \\\{\/ \{ print "\s+auth_basic off;"/);
    const followed = calls("mutant", "web follows a link in the markets volume")[0] ?? "";
    expect(followed).toContain('"web does not follow a link planted in the markets volume"');
    expect(script).toContain("sed '/disable_symlinks on/d'");
  });

  it("plants the volume dropped and the volume mounted writable, each killed by a check that is a call", () => {
    const dropped = calls("mutant", "web does not mount markets")[0] ?? "";
    expect(dropped).toContain('"web serves markets.json from the volume"');
    const writable = calls("mutant", "web mounts markets writable")[0] ?? "";
    expect(writable).toContain('"web cannot write in the folder of markets.json"');
    expect(script).toMatch(/volumes: !override \[ "markets:\/markets" \]/);
    expect(script).toMatch(/volumes: !override \[\]/);
  });
});
