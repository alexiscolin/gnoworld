import { Worlds, WORLDS_MAX_BYTES } from "@gnoworld/schemas";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { abciRefused, fakeChain, INDEXER, RPC, type Routes } from "../testing/fakeWorldsChain.ts";
import { EVERY_MS, PAUSE_MS, runWorlds, startWorlds } from "./job.ts";

// The worlds job (slice 7, 7c), one pass of it: the list, the worlds, the packages read once, the history through the indexer, the
// names, and a capped file written beside and renamed over. Every fault leaves the last file whole and is logged by its kind.
const A = "g10ragdr3cjqkael8rslpw4y6rlelhev4h0fswcx";
const B = "g1kfj7rq3cjqkael8rslpw4y6rlelhev4h0fswcx";
const POOL = "gno.land/r/gnoswap/pool";
const POOL1 = "gno.land/r/gnoswap/pool/v1";
const ROUTER = "gno.land/r/gnoswap/router";
// Written out, so the job is pinned to the expression itself and not to the builder it calls (core's evalNameOf).
const evalNameOf = (address: string): string => `gno.land/r/sys/users.ResolveAddress(address("${address}")).Name()`;
const NOW = Date.parse("2026-11-01T12:00:00.000Z");

const dir = mkdtempSync(join(tmpdir(), "gnoworld-worlds-"));
afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});
let n = 0;
const fresh = (): string => {
  n += 1;
  const folder = join(dir, `t${String(n)}`);
  mkdirSync(folder);
  return join(folder, "worlds.json");
};

const doc = (imports: string[] = ["gno.land/p/nt/avl/v0"]): string =>
  JSON.stringify({
    package_path: "x",
    package_line: "",
    package_doc: "",
    imports,
    bugs: [],
    values: [],
    types: [],
    funcs: [{ type: "", name: "Swap", crossing: true, signature: "", doc: "", params: [], results: [] }],
  });
const pathOf = (variables: Record<string, unknown>): string => String(variables["path"]);
const history = (calls: number, path: string): string =>
  JSON.stringify({
    data: {
      getTransactions: Array.from({ length: calls }, (_, i) => ({
        block_height: 100 + i,
        messages: [{ value: { __typename: "MsgCall", pkg_path: path, caller: i % 2 === 0 ? A : B } }],
      })),
    },
  });
const named = (name: string | null): string =>
  name === null ? "(nil *gno.land/r/sys/users.UserData)" : `("${name}" string)`;

const chainRoutes = (paths: string[], over: Routes = {}): Routes => ({
  paths: () => paths.join("\n"),
  doc: () => doc(),
  file: () => `[addpkg]\n  creator = "${A}"\n  height = 5\n`,
  indexer: ({ variables }) => history(2, pathOf(variables)),
  eval: (expression) => named(expression === evalNameOf(A) ? "alexis" : null),
  ...over,
});

interface Run {
  file: string;
  logged: { event: string; error?: string | undefined }[];
  chain: ReturnType<typeof fakeChain>;
  outcome: Awaited<ReturnType<typeof runWorlds>>;
  /** The pause asked before each wait, in order. */
  waits: number[];
}
async function run(
  routes: Routes,
  extra: { file?: string; now?: number; maxBytes?: number; delayMs?: number } = {},
): Promise<Run> {
  const file = extra.file ?? fresh();
  const logged: Run["logged"] = [];
  const chain = fakeChain(routes, { delayMs: extra.delayMs ?? 0 });
  const waits: number[] = [];
  const outcome = await runWorlds({
    file,
    log: (event, fields) => void logged.push({ event, error: fields?.error }),
    send: chain.send,
    universe: { id: "onyx", rpc: RPC, indexer: INDEXER },
    now: () => extra.now ?? NOW,
    wait: (ms) => Promise.resolve(void waits.push(ms)),
    ...(extra.maxBytes === undefined ? {} : { maxBytes: extra.maxBytes }),
  });
  return { file, logged, chain, outcome, waits };
}
const written = (file: string) => Worlds.parse(JSON.parse(readFileSync(file, "utf8")));

describe("runWorlds", () => {
  it("writes the worlds of the list, each realm with its deployer, functions, imports, calls and the deployer's name", async () => {
    const { file, outcome } = await run(chainRoutes([POOL, POOL1, ROUTER]));
    expect(outcome).toEqual({ wrote: true });
    const worlds = written(file);
    expect(worlds.universe).toBe("onyx");
    expect(worlds.updated).toBe("2026-11-01T12:00:00.000Z");
    expect(worlds.worlds.map((world) => world.id)).toEqual(["gnoswap/pool", "gnoswap/router"]);
    expect(worlds.worlds[0]?.realms.map((realm) => realm.path)).toEqual([POOL, POOL1]);
    expect(worlds.worlds[0]?.realms[0]).toEqual({
      path: POOL,
      deployer: A,
      deployerName: "alexis",
      functions: ["Swap"],
      imports: ["gno.land/p/nt/avl/v0"],
      calls: 2,
      callers: 2,
      lastHeight: 101,
    });
  });

  it("asks the name of each distinct deployer once, with the builder's expression and nothing else", async () => {
    const { chain } = await run(chainRoutes([POOL, POOL1, ROUTER]));
    const asked = chain.asked.filter(({ kind }) => kind === "vm/qeval").map(({ data }) => data);
    expect(asked).toEqual([evalNameOf(A)]);
  });

  it.each([
    ["no name registered", named(null), null],
    ["a name with markup", '("<script>" string)', null],
    ["a name of 200 characters", `("${"a".repeat(200)}" string)`, null],
    ["a text that is no value", "panic: oops", null],
    ["a name", named("moul"), "moul"],
  ])("takes %s for the deployer's name %j", async (_name, answer, expected) => {
    const { file } = await run(chainRoutes([POOL], { eval: () => answer }));
    expect(written(file).worlds[0]?.realms[0]?.deployerName).toBe(expected);
  });

  it("gives each realm the name of its own deployer; a refusal for one leaves only that one without, the next is still asked", async () => {
    const C = `g1${"q".repeat(38)}`;
    const creators: Record<string, string> = { [POOL]: A, [ROUTER]: B, "gno.land/r/zeta/dex": C };
    const { file, chain } = await run(
      chainRoutes([POOL, ROUTER, "gno.land/r/zeta/dex"], {
        file: (path) => `[addpkg]\n  creator = "${creators[path.replace("/gnomod.toml", "")] ?? A}"\n`,
        eval: (expression) =>
          expression === evalNameOf(B) ? abciRefused() : named(expression === evalNameOf(A) ? "alexis" : "carol"),
      }),
    );
    const names = Object.fromEntries(written(file).worlds.map((world) => [world.id, world.realms[0]?.deployerName]));
    expect(names).toEqual({ "gnoswap/pool": "alexis", "gnoswap/router": null, "zeta/dex": "carol" });
    expect(chain.asked.filter(({ kind }) => kind === "vm/qeval")).toHaveLength(3);
  });

  it("leaves a name out when the chain answers a panic, and asks the next deployer", async () => {
    const { file } = await run(
      chainRoutes([POOL, ROUTER], {
        file: (path) => `[addpkg]\n  creator = "${path.includes("router") ? B : A}"\n`,
        eval: (expression) => (expression === evalNameOf(A) ? "panic: no such user" : named("bob")),
      }),
    );
    const names = written(file).worlds.map((world) => world.realms[0]?.deployerName);
    expect(names).toEqual([null, "bob"]);
  });

  it("cancels a name's answer that never ends, without reading it to its end, and leaves the name out", async () => {
    let pulled = 0;
    const endless = () =>
      new Response(
        new ReadableStream<Uint8Array>({
          pull(controller) {
            pulled += 1;
            controller.enqueue(new Uint8Array(64 * 1024));
          },
        }),
      );
    const { file } = await run(chainRoutes([POOL], { eval: endless }));
    expect(pulled).toBeLessThan(100);
    expect(written(file).worlds[0]?.realms[0]?.deployerName).toBeNull();
  });

  // Recorded through gnomcp on onyx-1, 2026-11-01: ResolveAddress of an address with no name, then .Name(), is refused by the chain
  // ("value method ...UserData.Name called using nil *UserData pointer"), an error of the query and no typed value.
  it("takes the chain's refusal for an address with no registered name as no name", async () => {
    const { file, outcome } = await run(chainRoutes([POOL], { eval: () => abciRefused("/std.UnauthorizedError") }));
    expect(outcome).toEqual({ wrote: true });
    expect(written(file).worlds[0]?.realms[0]?.deployerName).toBeNull();
  });

  it("leaves a name out when the chain refuses the query, and keeps the rest", async () => {
    const { file, logged } = await run(chainRoutes([POOL], { eval: () => new TypeError("fetch failed") }));
    const realm = written(file).worlds[0]?.realms[0];
    expect(realm?.deployerName).toBeNull();
    expect(realm?.calls).toBe(2);
    expect(logged).toEqual([]);
  });

  it("goes out to the RPC's host and the indexer's, and to no other", async () => {
    const { chain } = await run(chainRoutes([POOL, ROUTER]));
    const hosts = new Set(chain.asked.map(({ url }) => new URL(url).host));
    expect(hosts).toEqual(new Set(["rpc.onyx.testnets.gno.land", "indexer.onyx.testnets.gno.land"]));
  });

  it("asks one call at a time", async () => {
    const { chain } = await run(chainRoutes([POOL, POOL1, ROUTER]), { delayMs: 2 });
    expect(chain.parallel()).toBe(1);
  });

  it("waits a positive pause between two calls of the pass, and before none: one fewer wait than calls", async () => {
    const { chain, waits } = await run(chainRoutes([POOL, POOL1, ROUTER]));
    expect(chain.asked.length).toBeGreaterThan(8);
    expect(waits).toHaveLength(chain.asked.length - 1);
    expect(waits.every((ms) => ms === PAUSE_MS)).toBe(true);
    expect(PAUSE_MS).toBeGreaterThan(0);
    expect(PAUSE_MS).toBeLessThanOrEqual(5_000);
  });

  it("runs a pass every half hour unless told otherwise: the pause times the calls of a first pass stay far under it", () => {
    expect(EVERY_MS).toBe(30 * 60_000);
  });

  it("gives every kind of call a time limit that is finite and positive", async () => {
    const { chain } = await run(chainRoutes([POOL]));
    expect(new Set(chain.asked.map(({ kind }) => kind))).toEqual(
      new Set(["vm/qpaths", "vm/qdoc", "vm/qfile", "vm/qeval", "indexer"]),
    );
    for (const { ms } of chain.asked) {
      expect(ms).toBeGreaterThan(0);
      expect(ms).toBeLessThanOrEqual(30_000);
    }
  });

  it("reads a package once: a second pass over the same list asks no vm/qdoc and no vm/qfile", async () => {
    const file = fresh();
    await run(chainRoutes([POOL, ROUTER]), { file });
    const second = await run(chainRoutes([POOL, ROUTER]), { file });
    expect(second.chain.asked.filter(({ kind }) => kind === "vm/qdoc" || kind === "vm/qfile")).toEqual([]);
    expect(written(file).worlds[0]?.realms[0]?.functions).toEqual(["Swap"]);
  });

  it("reads only the new package when a realm joins the list", async () => {
    const file = fresh();
    await run(chainRoutes([POOL]), { file });
    const second = await run(chainRoutes([POOL, ROUTER]), { file });
    expect(second.chain.asked.filter(({ kind }) => kind === "vm/qdoc").map(({ data }) => data)).toEqual([ROUTER]);
  });

  describe("new families and batches, by comparing lists", () => {
    it("marks no world as seen on a first pass: with no earlier list, nothing is new", async () => {
      const { file } = await run(chainRoutes([POOL, ROUTER]));
      expect(written(file).worlds.map((world) => world.seen ?? null)).toEqual([null, null]);
    });

    it("stamps a world that joined the list with the pass's time, and keeps the stamp of the others", async () => {
      const file = fresh();
      await run(chainRoutes([POOL]), { file, now: NOW });
      await run(chainRoutes([POOL, ROUTER]), { file, now: NOW + 60_000 });
      await run(chainRoutes([POOL, ROUTER]), { file, now: NOW + 120_000 });
      const seen = Object.fromEntries(written(file).worlds.map((world) => [world.id, world.seen ?? null]));
      expect(seen).toEqual({ "gnoswap/pool": null, "gnoswap/router": "2026-11-01T12:01:00.000Z" });
    });

    it("flags the worlds of a batch: five new realms of one namespace in one pass", async () => {
      const file = fresh();
      await run(chainRoutes([POOL]), { file });
      const mass = Array.from({ length: 6 }, (_, i) => `gno.land/r/mass/app${String(i)}/v0`);
      await run(chainRoutes([POOL, ...mass]), { file });
      const worlds = written(file).worlds;
      expect(worlds.filter((world) => world.batch === true).map((world) => world.namespace)).toEqual(
        mass.map(() => "mass"),
      );
      expect(worlds.find((world) => world.id === "gnoswap/pool")?.batch).toBeUndefined();
    });
  });

  describe("the list is down", () => {
    it.each([
      ["a network fault", new TypeError("fetch failed"), "request"],
      ["a timeout", Object.assign(new Error("t"), { name: "TimeoutError" }), "timeout"],
      ["a 502", new Response("down", { status: 502 }), "status"],
      ["a page of HTML", new Response("<html>"), "shape"],
    ])("keeps the last file byte for byte on %s, logs its kind, and does not throw", async (_name, given, kind) => {
      const file = fresh();
      await run(chainRoutes([POOL]), { file });
      const before = readFileSync(file, "utf8");
      const { outcome, logged } = await run(chainRoutes([POOL], { paths: () => given }), { file, now: NOW + 5 });
      expect(outcome).toEqual({ wrote: false, kind });
      expect(readFileSync(file, "utf8")).toBe(before);
      expect(logged).toEqual([{ event: "worlds_failed", error: kind }]);
    });

    it("writes no file when there was none, and no temp file is left", async () => {
      const file = fresh();
      await run(chainRoutes([], { paths: () => new TypeError("fetch failed") }), { file });
      expect(existsSync(file)).toBe(false);
      expect(readdirSync(join(file, ".."))).toEqual([]);
    });

    it("keeps the last file when the chain answers an empty list for a chain that had realms", async () => {
      const file = fresh();
      await run(chainRoutes([POOL, ROUTER]), { file });
      const before = readFileSync(file, "utf8");
      const { outcome } = await run(chainRoutes([], { paths: () => "" }), { file });
      expect(outcome).toEqual({ wrote: false, kind: "empty" });
      expect(readFileSync(file, "utf8")).toBe(before);
    });

    it("keeps the last file when it is a hostile list that Zod refuses", async () => {
      const file = fresh();
      await run(chainRoutes([POOL]), { file });
      const before = readFileSync(file, "utf8");
      const { outcome } = await run(chainRoutes([], { paths: () => "<script>\ngno.land/p/a/b" }), { file });
      expect(outcome.wrote).toBe(false);
      expect(readFileSync(file, "utf8")).toBe(before);
    });
  });

  describe("the indexer is silent: a world at rest", () => {
    it("writes the worlds with calls, callers and last height null, nothing else lost", async () => {
      const { file, logged, outcome } = await run(
        chainRoutes([POOL, ROUTER], { indexer: () => new TypeError("fetch failed") }),
      );
      expect(outcome).toEqual({ wrote: true });
      const realm = written(file).worlds[0]?.realms[0];
      expect(realm).toMatchObject({ deployer: A, functions: ["Swap"], calls: null, callers: null, lastHeight: null });
      expect(logged.map(({ event }) => event)).toEqual(["worlds_indexer_failed"]);
    });

    it("stops asking the indexer for the pass once it is silent: not a request for every realm", async () => {
      const paths = Array.from({ length: 40 }, (_, i) => `gno.land/r/ns/app${String(i)}`);
      const { chain } = await run(chainRoutes(paths, { indexer: () => new Response("down", { status: 502 }) }));
      expect(chain.asked.filter(({ kind }) => kind === "indexer").length).toBeLessThanOrEqual(3);
    });

    it("ends the indexer reads after three shape answers in a row and logs the indexer as failed, not once a realm", async () => {
      const paths = Array.from({ length: 40 }, (_, i) => `gno.land/r/ns/app${String(i)}`);
      const wrong = JSON.stringify({ errors: [{ message: "unknown field" }], data: null });
      const { chain, logged, outcome } = await run(chainRoutes(paths, { indexer: () => wrong }));
      expect(outcome).toEqual({ wrote: true });
      expect(chain.asked.filter(({ kind }) => kind === "indexer")).toHaveLength(3);
      expect(logged).toContainEqual({ event: "worlds_indexer_failed", error: "shape" });
    });

    it("keeps asking after a shape answer that is not followed by two more, for one realm may be the odd one", async () => {
      const paths = Array.from({ length: 10 }, (_, i) => `gno.land/r/ns/app${String(i)}`);
      let n = 0;
      const { chain } = await run(
        chainRoutes(paths, {
          indexer: ({ variables }) => {
            n += 1;
            return n % 3 === 0 ? "{}" : history(1, pathOf(variables));
          },
        }),
      );
      expect(chain.asked.filter(({ kind }) => kind === "indexer")).toHaveLength(10);
    });

    it("keeps the earlier counts of a realm the indexer cannot answer now, and updates the others", async () => {
      const file = fresh();
      await run(chainRoutes([POOL, ROUTER], { indexer: ({ variables }) => history(4, pathOf(variables)) }), { file });
      await run(
        chainRoutes([POOL, ROUTER], {
          indexer: ({ variables }) =>
            Object.values(variables).includes(POOL) ? history(7, POOL) : new TypeError("down"),
        }),
        { file },
      );
      const calls = Object.fromEntries(written(file).worlds.map((world) => [world.id, world.realms[0]?.calls]));
      expect(calls).toEqual({ "gnoswap/pool": 7, "gnoswap/router": 4 });
    });

    it("writes the file even when every read of a package failed, with empty facts", async () => {
      const { file } = await run(chainRoutes([POOL], { doc: () => new TypeError("down") }));
      expect(written(file).worlds[0]?.realms[0]).toMatchObject({
        path: POOL,
        deployer: null,
        functions: [],
        imports: [],
      });
    });

    it("logs a kind and nothing the indexer or the chain wrote", async () => {
      const { logged } = await run(
        chainRoutes([POOL], { indexer: () => new Error("secret-token-123 https://evil.example") }),
      );
      expect(JSON.stringify(logged)).not.toMatch(/secret|evil/);
    });
  });

  describe("hostile answers", () => {
    it("writes a world's path as data in the file and never lets a path or a name out of its field", async () => {
      const { file } = await run(
        chainRoutes([POOL, "gno.land/r/a/<img src=x onerror=alert(1)>"], { eval: () => '("</script>" string)' }),
      );
      const text = readFileSync(file, "utf8");
      expect(text).not.toContain("<img");
      expect(text).not.toContain("</script>");
    });

    it("keeps the last file and logs too_large when not even a file with no realm fits the cap", async () => {
      const file = fresh();
      await run(chainRoutes([POOL]), { file });
      const before = readFileSync(file, "utf8");
      const { outcome, logged } = await run(chainRoutes([POOL, ROUTER]), { file, maxBytes: 40 });
      expect(outcome).toEqual({ wrote: false, kind: "too_large" });
      expect(readFileSync(file, "utf8")).toBe(before);
      expect(logged).toEqual([{ event: "worlds_failed", error: "too_large" }]);
    });

    describe("a world that breaks the byte cap", () => {
      const fat = JSON.stringify({
        imports: [],
        funcs: Array.from({ length: 200 }, (_, i) => ({ type: "", name: `Fn${String(i)}` })),
      });
      const evil = (n: number, world: (i: number) => string): string[] =>
        Array.from({ length: n }, (_, i) => `gno.land/r/evil/${world(i)}`);
      const routes = (paths: string[]) => chainRoutes(paths, { doc: (path) => (path.includes("evil") ? fat : doc()) });

      it("is shed to fit and not refused: its lists go, the other worlds stay whole", async () => {
        const paths = [ROUTER, ...evil(6, (i) => `fat_${String(i)}`)];
        const { file, outcome, logged } = await run(routes(paths), { maxBytes: 8_000 });
        expect(outcome).toEqual({ wrote: true });
        const worlds = written(file).worlds;
        expect(worlds.find((world) => world.id === "gnoswap/router")?.realms[0]?.functions).toEqual(["Swap"]);
        const lean = worlds.find((world) => world.id === "evil/fat");
        expect(lean?.realms).toHaveLength(6);
        expect(lean?.realms.every((realm) => realm.functions.length === 0 && realm.imports.length === 0)).toBe(true);
        expect(readFileSync(file).byteLength).toBeLessThanOrEqual(8_000);
        expect(logged).toContainEqual({ event: "worlds_shed", error: "lists" });
      });

      it("is dropped whole when stripped lists still pass the cap, and the others are written", async () => {
        const paths = [ROUTER, ...evil(40, (i) => `fat${String(i)}`)];
        const { file, outcome, logged } = await run(routes(paths), { maxBytes: 4_000 });
        expect(outcome).toEqual({ wrote: true });
        expect(readFileSync(file).byteLength).toBeLessThanOrEqual(4_000);
        expect(written(file).worlds.map((world) => world.id)).toContain("gnoswap/router");
        expect(logged).toContainEqual({ event: "worlds_shed", error: "worlds" });
      });
    });

    it("logs a list cut at the request cap once by a kind, and still writes what it found (F3538)", async () => {
      // Every prefix answers a full page (10,000 lines); a prefix that is a realm path itself is among its lines.
      const filler = Array.from({ length: 9_999 }, (_, i) => `gno.land/r/zz/p${String(i)}`).join("\n");
      const { file, outcome, logged } = await run(chainRoutes([], { paths: (prefix) => `${filler}\n${prefix}` }));
      expect(outcome).toEqual({ wrote: true });
      expect(written(file).worlds.length).toBeGreaterThan(0);
      expect(logged.filter(({ error }) => error === "list")).toEqual([{ event: "worlds_shed", error: "list" }]);
    });

    it("writes a file for the recorded list of 743 realms under the default cap, with room to spare", async () => {
      const onyx = readFileSync(new URL("./onyxPaths.txt", import.meta.url), "utf8")
        .split("\n")
        .filter((line) => line !== "");
      const { file, outcome } = await run(chainRoutes(onyx));
      expect(outcome).toEqual({ wrote: true });
      expect(written(file).worlds).toHaveLength(533);
      expect(readFileSync(file).byteLength).toBeLessThan(WORLDS_MAX_BYTES / 4);
    });

    it("writes the plan's 10,000 worlds (12,000 realms, past the chain's 10,000 per answer) under the default cap", async () => {
      const all = Array.from({ length: 12_000 }, (_, i) => `gno.land/r/ns${i.toString(36)}/app${String(i % 10_000)}`);
      const sortedAll = [...all].sort();
      const { file, outcome } = await run(
        chainRoutes(all, {
          paths: (prefix) =>
            sortedAll
              .filter((path) => path.startsWith(prefix))
              .slice(0, 10_000)
              .join("\n"),
        }),
      );
      expect(outcome).toEqual({ wrote: true });
      expect(written(file).worlds.length).toBeGreaterThanOrEqual(10_000);
      expect(readFileSync(file).byteLength).toBeLessThanOrEqual(WORLDS_MAX_BYTES);
    }, 60_000);

    it("takes a file of exactly the byte cap whole, and sheds the lists for one byte under", async () => {
      const probe = await run(chainRoutes([POOL, ROUTER]));
      const size = readFileSync(probe.file).byteLength;
      const exact = await run(chainRoutes([POOL, ROUTER]), { maxBytes: size });
      expect(exact.outcome).toEqual({ wrote: true });
      expect(written(exact.file).worlds[0]?.realms[0]?.functions).toEqual(["Swap"]);
      const under = await run(chainRoutes([POOL, ROUTER]), { maxBytes: size - 1 });
      expect(under.outcome).toEqual({ wrote: true });
      expect(written(under.file).worlds.flatMap((world) => world.realms.flatMap((realm) => realm.functions))).toEqual([
        "Swap",
      ]);
    });

    it("keeps the other worlds when one world holds 513 realms, reading only 512 of them", async () => {
      const many = Array.from({ length: 513 }, (_, i) => `gno.land/r/evil/a_x${String(i).padStart(3, "0")}`);
      const { file, outcome, chain } = await run(chainRoutes([ROUTER, ...many]));
      expect(outcome).toEqual({ wrote: true });
      const worlds = written(file).worlds;
      expect(worlds.find((world) => world.id === "evil/a")?.realms).toHaveLength(512);
      expect(worlds.find((world) => world.id === "gnoswap/router")?.realms).toHaveLength(1);
      expect(chain.asked.filter(({ kind }) => kind === "vm/qdoc")).toHaveLength(513);
    });

    it("keeps the other worlds when a list line names a namespace of 129 characters", async () => {
      const long = `gno.land/r/${"a".repeat(129)}/x`;
      const { file, outcome } = await run(chainRoutes([ROUTER, long]));
      expect(outcome).toEqual({ wrote: true });
      expect(written(file).worlds.map((world) => world.id)).toEqual(["gnoswap/router"]);
    });

    it("does not call a realm that left the list and came back a new world, nor its namespace a batch", async () => {
      const file = fresh();
      const batch = Array.from({ length: 6 }, (_, i) => `gno.land/r/mass/app${String(i)}/v0`);
      await run(chainRoutes([POOL, ROUTER, ...batch]), { file, now: NOW });
      await run(chainRoutes([POOL, ...batch.slice(0, 2)]), { file, now: NOW + 60_000 });
      expect(written(file).worlds.map((world) => world.id)).toContain("gnoswap/router");
      await run(chainRoutes([POOL, ROUTER, ...batch]), { file, now: NOW + 120_000 });
      expect(written(file).worlds.some((world) => world.seen !== undefined || world.batch === true)).toBe(false);
    });

    it("writes a realm that left the list into the file still, with its facts: a chain only adds realms", async () => {
      const file = fresh();
      await run(chainRoutes([POOL, ROUTER]), { file });
      await run(chainRoutes([POOL]), { file });
      const router = written(file).worlds.find((world) => world.id === "gnoswap/router");
      expect(router?.realms[0]).toMatchObject({ path: ROUTER, functions: ["Swap"] });
    });

    it("keeps the last file whole and says write when the file cannot be written, leaving no temp file", async () => {
      const file = fresh();
      await run(chainRoutes([POOL]), { file });
      const before = readFileSync(file, "utf8");
      mkdirSync(`${file}.tmp`);
      const { outcome, logged } = await run(chainRoutes([POOL, ROUTER]), { file });
      expect(outcome).toEqual({ wrote: false, kind: "write" });
      expect(logged).toEqual([{ event: "worlds_failed", error: "write" }]);
      expect(readFileSync(file, "utf8")).toBe(before);
    });

    it("says write for a folder that is not there, and throws nothing", async () => {
      const file = join(fresh(), "..", "nowhere", "worlds.json");
      const { outcome } = await run(chainRoutes([POOL]), { file });
      expect(outcome).toEqual({ wrote: false, kind: "write" });
    });

    it("starts from nothing when the last file is corrupt, and writes a good one", async () => {
      const file = fresh();
      writeFileSync(file, '{"version":1,"worlds":[{"id":');
      const { outcome } = await run(chainRoutes([POOL]), { file });
      expect(outcome).toEqual({ wrote: true });
      expect(written(file).worlds).toHaveLength(1);
    });

    it("starts from nothing when the last file is another universe's", async () => {
      const file = fresh();
      await run(chainRoutes([POOL]), { file });
      const other = { ...(JSON.parse(readFileSync(file, "utf8")) as object), universe: "gnoland" };
      writeFileSync(file, JSON.stringify(other));
      const second = await run(chainRoutes([POOL, ROUTER]), { file });
      expect(second.chain.asked.filter(({ kind }) => kind === "vm/qdoc")).toHaveLength(2);
      expect(written(file).worlds.map((world) => world.seen ?? null)).toEqual([null, null]);
    });
  });
});

describe("startWorlds", () => {
  const base = { log: () => undefined, send: () => new Promise<Response>(() => undefined) };
  const universe = { id: "onyx", rpc: RPC, indexer: INDEXER };

  it.each([
    ["an RPC on loopback", { ...universe, rpc: "https://127.0.0.1:26657/" }],
    ["an indexer on the metadata address", { ...universe, indexer: "https://169.254.169.254/graphql" }],
    ["an indexer with a single label", { ...universe, indexer: "https://indexer/graphql/query" }],
    ["an http: indexer", { ...universe, indexer: "http://indexer.onyx.testnets.gno.land/graphql/query" }],
    ["a user in the indexer's address", { ...universe, indexer: "https://u:p@indexer.gno.land/graphql/query" }],
    ["a universe id with markup", { ...universe, id: "<b>" }],
    ["a universe id with markup after a name", { ...universe, id: "onyx<b>" }],
    ["a universe id with markup before a name", { ...universe, id: "<b>onyx" }],
    ["a universe id in upper case", { ...universe, id: "Onyx" }],
    ["a universe id of 33 characters", { ...universe, id: "a".repeat(33) }],
    ["an empty universe id", { ...universe, id: "" }],
  ])("refuses to start with %s, naming the worlds job", (_name, bad) => {
    expect(() => startWorlds({ ...base, file: fresh(), universe: bad })).toThrow(/worlds/);
  });

  // Polls for a condition with a deadline far past what the gate's load needs, instead of one fixed wait (F3374).
  const until = async (done: () => boolean): Promise<void> => {
    for (let waited = 0; !done() && waited < 10_000; waited += 10) await new Promise((r) => setTimeout(r, 10));
    expect(done()).toBe(true);
  };
  const quick = { pauseMs: 1, wait: () => Promise.resolve() };

  it("starts, asks the list once at start, writes the file and stops cleanly", async () => {
    const chain = fakeChain(chainRoutes([POOL]));
    const file = fresh();
    const job = startWorlds({ ...base, ...quick, send: chain.send, file, universe, everyMs: 3_600_000 });
    await until(() => existsSync(file));
    job.stop();
    expect(chain.asked.filter(({ kind }) => kind === "vm/qpaths")).toHaveLength(1);
  });

  it("runs another pass after the period, once the first has ended", async () => {
    const chain = fakeChain(chainRoutes([POOL]));
    const job = startWorlds({ ...base, ...quick, send: chain.send, file: fresh(), universe, everyMs: 20 });
    await until(() => chain.asked.filter(({ kind }) => kind === "vm/qpaths").length >= 3);
    job.stop();
  });

  it("starts no second pass while one is under way, whatever the period", async () => {
    let release: (() => void) | undefined;
    const held = new Promise<void>((resolve) => (release = resolve));
    const chain = fakeChain(chainRoutes([POOL]));
    const slow = async (...args: Parameters<typeof chain.send>) => {
      await held;
      return chain.send(...args);
    };
    const file = fresh();
    const job = startWorlds({ ...base, ...quick, send: slow, file, universe, everyMs: 1 });
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(chain.asked).toHaveLength(0);
    release?.();
    await until(() => existsSync(file));
    job.stop();
  });

  it("writes nothing after stop, though a pass was under way", async () => {
    let release: (() => void) | undefined;
    const held = new Promise<void>((resolve) => (release = resolve));
    const chain = fakeChain(chainRoutes([POOL]));
    const slow = async (...args: Parameters<typeof chain.send>) => {
      await held;
      return chain.send(...args);
    };
    const file = fresh();
    const job = startWorlds({ ...base, ...quick, send: slow, file, universe, everyMs: 3_600_000 });
    job.stop();
    release?.();
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(existsSync(file)).toBe(false);
    expect(readdirSync(join(file, ".."))).toEqual([]);
  });

  it("logs a pass that threw as internal, and runs the next one", async () => {
    const logged: string[] = [];
    let calls = 0;
    const job = startWorlds({
      ...base,
      ...quick,
      send: () => Promise.reject(new TypeError("boom")),
      log: (event, fields) => {
        calls += 1;
        if (calls <= 2) throw new Error("the log failed twice");
        logged.push(`${event} ${String(fields?.error)}`);
      },
      file: fresh(),
      universe,
      everyMs: 10,
    });
    await until(() => logged.length >= 2);
    job.stop();
    expect(logged[0]).toBe("worlds_failed internal");
    expect(logged[1]).toBe("worlds_failed request");
  });
});

describe("the behaviours the pass states", () => {
  const C = `g1${"q".repeat(38)}`;
  const THREE = [POOL, ROUTER, "gno.land/r/zeta/dex"];
  const creators: Record<string, string> = { [POOL]: A, [ROUTER]: B, "gno.land/r/zeta/dex": C };
  const byCreator = (path: string): string =>
    `[addpkg]\n  creator = "${creators[path.replace("/gnomod.toml", "")] ?? A}"\n`;
  const timeout = Object.assign(new Error("t"), { name: "TimeoutError" });
  const faults: [string, () => Response | Error][] = [
    ["a network fault", () => new TypeError("fetch failed")],
    ["a timeout", () => timeout],
    ["a status fault", () => new Response("down", { status: 502 })],
    ["a 429", () => new Response("slow down", { status: 429 })],
  ];

  it("leaves a realm whose indexer answer is odd and goes on to the next, keeping its counts", async () => {
    const { file, chain } = await run(
      chainRoutes([POOL, ROUTER], {
        indexer: ({ variables }) => (pathOf(variables) === POOL ? "{}" : history(2, ROUTER)),
      }),
    );
    expect(chain.asked.filter(({ kind }) => kind === "indexer")).toHaveLength(2);
    const calls = Object.fromEntries(written(file).worlds.map((world) => [world.id, world.realms[0]?.calls]));
    expect(calls).toEqual({ "gnoswap/pool": null, "gnoswap/router": 2 });
  });

  it.each(faults)("ends the package reads of the pass at %s, by the calls asked", async (_name, fault) => {
    const { chain, outcome } = await run(chainRoutes(THREE, { doc: fault }));
    expect(outcome).toEqual({ wrote: true });
    expect(chain.asked.filter(({ kind }) => kind === "vm/qdoc")).toHaveLength(1);
  });

  it.each(faults)("ends the name reads of the pass at %s, by the calls asked", async (_name, fault) => {
    const { chain, outcome } = await run(chainRoutes(THREE, { file: byCreator, eval: fault }));
    expect(outcome).toEqual({ wrote: true });
    expect(chain.asked.filter(({ kind }) => kind === "vm/qeval")).toHaveLength(1);
  });

  it("goes on to the next deployer's name when one name is refused", async () => {
    const { chain } = await run(
      chainRoutes(THREE, {
        file: byCreator,
        eval: (expression) => (expression === evalNameOf(A) ? abciRefused() : named("x")),
      }),
    );
    expect(chain.asked.filter(({ kind }) => kind === "vm/qeval")).toHaveLength(3);
  });

  it("does not ask the name of a deployer the last file already named", async () => {
    const file = fresh();
    await run(chainRoutes([POOL]), { file });
    const second = await run(chainRoutes([POOL, ROUTER]), { file });
    expect(second.chain.asked.filter(({ kind }) => kind === "vm/qeval")).toHaveLength(0);
    expect(written(file).worlds.flatMap((world) => world.realms.map((realm) => realm.deployerName))).toEqual([
      "alexis",
      "alexis",
    ]);
  });

  it("writes an empty file for an empty first list", async () => {
    const { file, outcome } = await run(chainRoutes([]));
    expect(outcome).toEqual({ wrote: true });
    expect(written(file).worlds).toEqual([]);
  });

  it.each([
    ["the list", (asked: { kind: string }[]) => asked.length > 0],
    ["the packages", (asked: { kind: string }[]) => asked.some(({ kind }) => kind === "vm/qdoc")],
    ["the indexer", (asked: { kind: string }[]) => asked.some(({ kind }) => kind === "indexer")],
    ["the last read", (asked: { kind: string }[]) => asked.filter(({ kind }) => kind === "indexer").length === 2],
  ])("writes nothing when it is stopped after %s", async (_name, stopped) => {
    const file = fresh();
    const chain = fakeChain(chainRoutes([POOL, ROUTER]));
    const logged: string[] = [];
    const outcome = await runWorlds({
      file,
      log: (event) => void logged.push(event),
      send: chain.send,
      universe: { id: "onyx", rpc: RPC, indexer: INDEXER },
      wait: () => Promise.resolve(),
      isStopped: () => stopped(chain.asked),
    });
    expect(outcome).toEqual({ wrote: false, kind: "stopped" });
    expect(existsSync(file)).toBe(false);
    expect(logged).toEqual(["worlds_failed"]);
  });
});
