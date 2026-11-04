import { NATURES, worldsDrawn } from "@gnoworld/core";
import { WorldsCount } from "@gnoworld/schemas";
import { WORLD_NATURES, Worlds, WORLDS_MAX_BYTES } from "@gnoworld/schemas/indexer";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { abciRefused, fakeChain, INDEXER, RPC, type Routes } from "../testing/fakeWorldsChain.ts";
import { EVERY_MS, PAUSE_MS, runWorlds, startWorlds, type RunOptions } from "./job.ts";
import { makePresence } from "./presence.ts";

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

const doc = (path: string, imports: string[] = ["gno.land/p/nt/avl/v0"]): string =>
  JSON.stringify({
    package_path: path,
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
  doc: (path) => doc(path),
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
  extra: {
    file?: string;
    now?: number;
    maxBytes?: number;
    delayMs?: number;
    historyMax?: number;
    trends?: RunOptions["trends"];
  } = {},
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
    ...(extra.historyMax === undefined ? {} : { historyMax: extra.historyMax }),
    ...(extra.trends === undefined ? {} : { trends: extra.trends }),
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

  // F4109 (Alexis, 2026-11-02): a nature leans a world's class, so it is read once, from every realm's own names, and kept with the
  // world as its first-seen time is: a stranger filling the file, whose lists the job then sheds, can no longer move another's class.
  describe("a world's nature, read once", () => {
    const VICTIM = "gno.land/r/victim/game";
    // A cap the file passes only once the stranger's lists and then the quiet victim's are shed, found by trying.
    const VICTIM_STRIPPED = 3_000;
    const docWith = (path: string, names: string[]): string =>
      JSON.stringify({ package_path: path, imports: [], funcs: names.map((name) => ({ type: "", name })) });

    it("names the file's natures as core's rules do", () => {
      const five = ["nft", "token", "exchange", "dao", "game"];
      expect(WORLD_NATURES).toEqual(five);
      expect(NATURES).toEqual(five);
    });

    it("writes a world's nature once every realm of it is read", async () => {
      const { file } = await run(chainRoutes([POOL, POOL1, ROUTER]));
      expect(written(file).worlds.map((world) => [world.id, world.nature])).toEqual([
        ["gnoswap/pool", "exchange"],
        ["gnoswap/router", "exchange"],
      ]);
    });

    it("writes none while a realm of the world is unread, then reads it when every one is", async () => {
      const file = fresh();
      await run(chainRoutes([POOL, POOL1], { doc: (path) => (path === POOL1 ? "not a doc" : doc(path)) }), { file });
      expect(written(file).worlds[0]).not.toHaveProperty("nature");
      await run(chainRoutes([POOL, POOL1]), { file });
      expect(written(file).worlds[0]?.nature).toBe("exchange");
    });

    it("keeps the nature it read when the file's lists were stripped since", async () => {
      const file = fresh();
      await run(chainRoutes([VICTIM], { doc: (path) => docWith(path, ["Play", "Render"]) }), { file });
      const shed = written(file);
      const bare = shed.worlds.map((world) => ({
        ...world,
        realms: world.realms.map((one) => ({ ...one, functions: [], imports: [] })),
      }));
      writeFileSync(file, `${JSON.stringify({ ...shed, worlds: bare })}\n`);
      await run(chainRoutes([VICTIM]), { file });
      expect(written(file).worlds[0]?.nature).toBe("game");
    });

    it("asks a shed realm no more once its world has its nature: the job pays once", async () => {
      const file = fresh();
      await run(chainRoutes([VICTIM], { doc: (path) => docWith(path, ["Play", "Render"]) }), { file });
      const shed = written(file);
      const bare = shed.worlds.map((world) => ({
        ...world,
        realms: world.realms.map((one) => ({ ...one, functions: [], imports: [] })),
      }));
      writeFileSync(file, `${JSON.stringify({ ...shed, worlds: bare })}\n`);
      const again = await run(chainRoutes([VICTIM]), { file });
      expect(again.chain.asked.filter(({ kind }) => kind === "vm/qdoc")).toEqual([]);
    });

    it("counts a realm the last file read with imports and no function as read", async () => {
      const file = fresh();
      const imports = (path: string) =>
        JSON.stringify({ package_path: path, imports: ["gno.land/p/nt/avl/v0"], funcs: [] });
      await run(chainRoutes([POOL, POOL1], { doc: (path) => (path === POOL1 ? "not a doc" : imports(path)) }), {
        file,
      });
      expect(written(file).worlds[0]).not.toHaveProperty("nature");
      await run(chainRoutes([POOL, POOL1]), { file });
      expect(written(file).worlds[0]?.nature).toBe("exchange");
    });

    it("keeps it whatever a new realm of the world says", async () => {
      const file = fresh();
      await run(chainRoutes([POOL]), { file });
      const governed = [POOL, POOL1, `${POOL}_gov`];
      await run(chainRoutes(governed, { doc: (path) => docWith(path, ["Vote", "Propose"]) }), { file });
      expect(written(file).worlds[0]?.nature).toBe("exchange");
    });

    it("reads the nature anew from a last file whose lists were shed before it had one: those realms are asked again", async () => {
      const file = fresh();
      await run(chainRoutes([VICTIM], { doc: (path) => docWith(path, ["Play", "Render"]) }), { file });
      const before = written(file);
      const stripped = before.worlds.map((world) => ({
        ...world,
        nature: undefined,
        realms: world.realms.map((one) => ({ ...one, functions: [], imports: [] })),
      }));
      writeFileSync(file, `${JSON.stringify({ ...before, worlds: stripped })}\n`);
      const again = await run(chainRoutes([VICTIM], { doc: (path) => docWith(path, ["Play", "Render"]) }), { file });
      expect(again.chain.asked.filter(({ kind }) => kind === "vm/qdoc").map(({ data }) => data)).toEqual([VICTIM]);
      expect(written(file).worlds[0]?.nature).toBe("game");
    });

    it("reads a realm read this pass with no name at all as nameless, beside its world's others", async () => {
      const { file } = await run(
        chainRoutes([POOL, POOL1], { doc: (path) => (path === POOL1 ? docWith(path, []) : doc(path)) }),
      );
      expect(written(file).worlds[0]?.nature).toBe("exchange");
    });

    it("reads a world no rule names as none, and keeps it so", async () => {
      const file = fresh();
      await run(chainRoutes([POOL], { doc: (path) => docWith(path, ["Render"]) }), { file });
      expect(written(file).worlds[0]?.nature).toBeNull();
      await run(chainRoutes([POOL, POOL1]), { file });
      expect(written(file).worlds[0]?.nature).toBeNull();
    });

    it("reads it before the file is shed: a stranger's flood strips a quiet world's lists, not its nature", async () => {
      const fat = (path: string, first: string) =>
        docWith(path, [first, ...Array.from({ length: 200 }, (_, i) => `Fn${String(i)}`)]);
      const paths = [ROUTER, VICTIM, ...Array.from({ length: 6 }, (_, i) => `gno.land/r/evil/fat_${String(i)}`)];
      const routes = chainRoutes(paths, {
        doc: (path) => (path === VICTIM ? fat(path, "Swap") : path.includes("evil") ? fat(path, "Play") : doc(path)),
        indexer: ({ variables }) => history(pathOf(variables) === ROUTER ? 2 : 0, pathOf(variables)),
      });
      const { file, logged } = await run(routes, { maxBytes: VICTIM_STRIPPED });
      expect(logged).toContainEqual({ event: "worlds_shed", error: "lists" });
      const worlds = written(file).worlds;
      const victim = worlds.find((world) => world.id === "victim/game");
      expect(victim?.realms.every((one) => one.functions.length === 0)).toBe(true);
      expect(victim?.nature).toBe("exchange");
      expect(worlds.find((world) => world.id === "evil/fat")?.nature).toBe("game");
      expect(worlds.find((world) => world.id === "gnoswap/router")?.nature).toBe("exchange");
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

    it("asks the indexer for at most the cap's realms a pass, the next run the next pass, and keeps the others' counts (F3518)", async () => {
      const paths = Array.from({ length: 12 }, (_, i) => `gno.land/r/ev/a_r${String(i).padStart(2, "0")}`);
      const file = fresh();
      const asked = (chain: Run["chain"]): number => chain.asked.filter(({ kind }) => kind === "indexer").length;
      const first = await run(chainRoutes(paths), { file, historyMax: 5, now: 0 });
      expect(asked(first.chain)).toBe(5);
      const second = await run(chainRoutes(paths, { indexer: ({ variables }) => history(9, pathOf(variables)) }), {
        file,
        historyMax: 5,
        now: EVERY_MS,
      });
      expect(asked(second.chain)).toBe(5);
      const calls = written(file).worlds.flatMap((world) => world.realms.map((realm) => realm.calls));
      expect(calls).toEqual([2, 2, 2, 2, 2, 9, 9, 9, 9, 9, null, null]);
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
      const fat = (path: string): string =>
        JSON.stringify({
          package_path: path,
          imports: [],
          funcs: Array.from({ length: 200 }, (_, i) => ({ type: "", name: `Fn${String(i)}` })),
        });
      const evil = (n: number, world: (i: number) => string): string[] =>
        Array.from({ length: n }, (_, i) => `gno.land/r/evil/${world(i)}`);
      // The stranger's realms are never called, the router is: the least active world is shed first.
      const routes = (paths: string[]) =>
        chainRoutes(paths, {
          doc: (path) => (path.includes("evil") ? fat(path) : doc(path)),
          indexer: ({ variables }) => history(pathOf(variables).includes("evil") ? 0 : 2, pathOf(variables)),
        });

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
      const filler = "x\n".repeat(9_999).trim();
      const { file, outcome, logged } = await run(chainRoutes([], { paths: (prefix) => `${filler}\n${prefix}` }));
      expect(outcome).toEqual({ wrote: true });
      expect(written(file).worlds.length).toBeGreaterThan(0);
      expect(logged.filter(({ error }) => error === "list")).toEqual([{ event: "worlds_shed", error: "list" }]);
    }, 60_000);

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

// The count beside the file (7n2): the home's hero reads a few bytes for its number, so a phone asks nothing of the cosmos before View in
// space. It is core's count of the file the pass writes, the one the scene's count uses, written with it or not at all.
describe("the worlds' count, beside their file", () => {
  // Written out, so the job is pinned to the name nginx serves (deploy/web/nginx.conf) and not to a helper it calls.
  const countFileOf = (file: string) => join(file, "..", "worlds-count.json");
  const countOf = (file: string) => WorldsCount.parse(JSON.parse(readFileSync(countFileOf(file), "utf8")));
  const ONYX = readFileSync(new URL("./onyxPaths.txt", import.meta.url), "utf8")
    .split("\n")
    .filter((line) => line !== "");

  it("writes beside the worlds' file their count with the Earth, with the file's universe and time, and nothing else", async () => {
    const { file, outcome } = await run(chainRoutes([POOL, POOL1, ROUTER]));
    expect(outcome).toEqual({ wrote: true });
    expect(countOf(file)).toEqual({ version: 1, universe: "onyx", updated: "2026-11-01T12:00:00.000Z", count: 3 });
    expect(readFileSync(countFileOf(file), "utf8")).toBe(`${JSON.stringify(countOf(file))}\n`);
    expect(readdirSync(join(file, "..")).sort()).toEqual(["worlds-count.json", "worlds.json"]);
  });

  it("counts the recorded chain's file as the scene does, core's count of the file written: 534", async () => {
    const { file } = await run(chainRoutes(ONYX));
    expect(countOf(file).count).toBe(534);
    expect(countOf(file).count).toBe(worldsDrawn(written(file).worlds));
  }, 60_000);

  it("counts the file as written, with the worlds the byte cap dropped left out", async () => {
    const fat = (path: string): string =>
      JSON.stringify({
        package_path: path,
        imports: [],
        funcs: Array.from({ length: 200 }, (_, i) => ({ type: "", name: `Fn${String(i)}` })),
      });
    const paths = [ROUTER, ...Array.from({ length: 40 }, (_, i) => `gno.land/r/evil/fat${String(i)}`)];
    const { file, logged } = await run(
      chainRoutes(paths, { doc: (path) => (path.includes("evil") ? fat(path) : doc(path)) }),
      { maxBytes: 4_000 },
    );
    expect(logged).toContainEqual({ event: "worlds_shed", error: "worlds" });
    expect(countOf(file).count).toBe(written(file).worlds.length + 1);
    expect(countOf(file).count).toBeLessThan(paths.length + 1);
  });

  it("follows each pass: a world that joins the list joins the count", async () => {
    const file = fresh();
    await run(chainRoutes([POOL]), { file });
    expect(countOf(file).count).toBe(2);
    await run(chainRoutes([POOL, ROUTER]), { file, now: NOW + EVERY_MS });
    expect(countOf(file)).toMatchObject({ count: 3, updated: new Date(NOW + EVERY_MS).toISOString() });
  });

  it("writes the count on the first pass after the upgrade, beside a worlds' file that has none yet", async () => {
    const file = fresh();
    await run(chainRoutes([POOL]), { file });
    rmSync(countFileOf(file));
    const { outcome } = await run(chainRoutes([POOL, ROUTER]), { file, now: NOW + 5 });
    expect(outcome).toEqual({ wrote: true });
    expect(countOf(file).count).toBe(3);
    expect(written(file).worlds).toHaveLength(2);
  });

  it("names the count after a worlds' file of another name, so the two never share one", async () => {
    const file = join(fresh(), "..", "onyx.json");
    const { outcome } = await run(chainRoutes([POOL]), { file });
    expect(outcome).toEqual({ wrote: true });
    expect(readdirSync(join(file, "..")).sort()).toEqual(["onyx-count.json", "onyx.json"]);
  });

  it("names the count after the worlds' file alone, whatever its folder is called", async () => {
    const folder = join(fresh(), "..", "d.json");
    mkdirSync(folder);
    const { outcome } = await run(chainRoutes([POOL]), { file: join(folder, "worlds.json") });
    expect(outcome).toEqual({ wrote: true });
    expect(readdirSync(folder).sort()).toEqual(["worlds-count.json", "worlds.json"]);
  });

  it("writes no count when the pass fails, and keeps the last one byte for byte", async () => {
    const none = fresh();
    await run(chainRoutes([], { paths: () => new TypeError("fetch failed") }), { file: none });
    expect(existsSync(countFileOf(none))).toBe(false);
    const file = fresh();
    await run(chainRoutes([POOL]), { file });
    const before = readFileSync(countFileOf(file), "utf8");
    const { outcome } = await run(chainRoutes([POOL, ROUTER], { paths: () => new Response("down", { status: 502 }) }), {
      file,
      now: NOW + 5,
    });
    expect(outcome).toEqual({ wrote: false, kind: "status" });
    expect(readFileSync(countFileOf(file), "utf8")).toBe(before);
  });

  it("writes neither file when the count cannot be written: both keep their last text, and no temporary stays", async () => {
    const file = fresh();
    await run(chainRoutes([POOL]), { file });
    const before = [readFileSync(file, "utf8"), readFileSync(countFileOf(file), "utf8")];
    mkdirSync(`${countFileOf(file)}.tmp`);
    const { outcome, logged } = await run(chainRoutes([POOL, ROUTER]), { file, now: NOW + 5 });
    expect(outcome).toEqual({ wrote: false, kind: "write" });
    expect(logged).toEqual([{ event: "worlds_failed", error: "write" }]);
    expect([readFileSync(file, "utf8"), readFileSync(countFileOf(file), "utf8")]).toEqual(before);
    expect(readdirSync(join(file, "..")).sort()).toEqual(["worlds-count.json", "worlds-count.json.tmp", "worlds.json"]);
  });

  it("writes neither file when the worlds' file cannot be written: the count keeps its last text", async () => {
    const file = fresh();
    await run(chainRoutes([POOL]), { file });
    const before = readFileSync(countFileOf(file), "utf8");
    mkdirSync(`${file}.tmp`);
    const { outcome } = await run(chainRoutes([POOL, ROUTER]), { file, now: NOW + 5 });
    expect(outcome).toEqual({ wrote: false, kind: "write" });
    expect(readFileSync(countFileOf(file), "utf8")).toBe(before);
    expect(existsSync(`${countFileOf(file)}.tmp`)).toBe(false);
  });
});

// The ticker's trends (7t) compare a pass with the one before it: the job tells them each file it wrote and the calls it read, realm by
// realm, and nothing of a pass that wrote nothing, so a silent indexer or a failed write is never a world's gain.
describe("the trends it tells", () => {
  const keeper = () => {
    const told: { worlds: Worlds; read: Map<string, number> }[] = [];
    const trends: RunOptions["trends"] = {
      passed: (worlds, read) =>
        void told.push({ worlds, read: new Map([...read].map(([path, { calls }]) => [path, calls])) }),
    };
    return { told, trends };
  };

  it("tells the file it wrote, and the calls of each realm this pass read, none for a realm it could not read", async () => {
    const { told, trends } = keeper();
    const odd = chainRoutes([POOL, POOL1, ROUTER], {
      indexer: ({ variables }) => (pathOf(variables) === POOL1 ? "{}" : history(3, pathOf(variables))),
    });
    const { file } = await run(odd, { trends });
    expect(told).toHaveLength(1);
    expect(told[0]?.worlds).toEqual(written(file));
    expect(told[0]?.read).toEqual(
      new Map([
        [POOL, 3],
        [ROUTER, 3],
      ]),
    );
  });

  // 7t3: the window between two passes is counted from the height the last file wrote for each realm it read.
  it("tells each realm's transactions above the last file's height and who sent them, and writes the file without them", async () => {
    const file = fresh();
    const told: Parameters<NonNullable<RunOptions["trends"]>["passed"]>[1][] = [];
    const trends: RunOptions["trends"] = { passed: (_worlds, read) => void told.push(read) };
    await run(chainRoutes([POOL, ROUTER]), { file, trends });
    expect(written(file).worlds.flatMap(({ realms }) => realms.map(({ lastHeight }) => lastHeight))).toEqual([
      101, 101,
    ]);
    const busier = chainRoutes([POOL, ROUTER], {
      indexer: ({ variables }) => history(pathOf(variables) === POOL ? 5 : 2, pathOf(variables)),
    });
    const { outcome } = await run(busier, { file, now: NOW + 5, trends });
    expect(outcome).toEqual({ wrote: true });
    expect(told[0]?.get(POOL)?.recent, "a first file has no height to count from").toBeUndefined();
    expect(told[1]?.get(POOL)?.recent).toEqual({ transactions: [`102:${A}`, `103:${B}`, `104:${A}`], callers: [A, B] });
    expect(told[1]?.get(ROUTER)?.recent).toEqual({ transactions: [], callers: [] });
    expect(readFileSync(file, "utf8")).not.toContain("recent");
    expect(written(file).worlds.find(({ id }) => id === "gnoswap/pool")?.realms[0]).toMatchObject({
      calls: 5,
      lastHeight: 104,
    });
  });

  it("counts every call of a realm the last file read with none yet, and gives no window to one it never read", async () => {
    const file = fresh();
    const told: Parameters<NonNullable<RunOptions["trends"]>["passed"]>[1][] = [];
    const trends: RunOptions["trends"] = { passed: (_worlds, read) => void told.push(read) };
    const quiet = chainRoutes([POOL, ROUTER], {
      indexer: ({ variables }) => (pathOf(variables) === ROUTER ? "{}" : history(0, pathOf(variables))),
    });
    await run(quiet, { file, trends });
    expect(
      written(file).worlds.flatMap(({ realms }) => realms.map(({ calls, lastHeight }) => [calls, lastHeight])),
    ).toEqual([
      [0, null],
      [null, null],
    ]);
    await run(chainRoutes([POOL, ROUTER]), { file, now: NOW + 5, trends });
    expect(told[1]?.get(POOL)?.recent).toEqual({ transactions: [`100:${A}`, `101:${B}`], callers: [A, B] });
    expect(told[1]?.get(ROUTER)?.recent).toBeUndefined();
  });

  it("tells no read of a pass whose indexer is silent, though it writes the file with the last counts", async () => {
    const file = fresh();
    await run(chainRoutes([POOL]), { file });
    const { told, trends } = keeper();
    await run(chainRoutes([POOL], { indexer: () => new TypeError("fetch failed") }), { file, now: NOW + 5, trends });
    expect(told.map(({ read }) => read.size)).toEqual([0]);
    expect(written(file).worlds[0]?.realms[0]?.calls).toBe(2);
  });

  it("tells nothing of a pass that wrote nothing: the list down, or the file refused", async () => {
    const { told, trends } = keeper();
    await run(chainRoutes([POOL], { paths: () => new TypeError("fetch failed") }), { trends });
    const file = fresh();
    mkdirSync(`${file}.tmp`);
    const { outcome } = await run(chainRoutes([POOL]), { file, trends });
    expect(outcome).toEqual({ wrote: false, kind: "write" });
    expect(told).toEqual([]);
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

  it("keeps the chain's window of its passes for the ticker's route, each pass against the one before (7t)", async () => {
    let reads = 0;
    const counting = chainRoutes([POOL], {
      indexer: () => {
        reads += 1;
        return history(6 * reads, POOL);
      },
    });
    const chain = fakeChain(counting);
    const job = startWorlds({ ...base, ...quick, send: chain.send, file: fresh(), universe, everyMs: 20 });
    expect(job.trends()).toEqual({ worlds: [], newest: [] });
    await until(() => job.trends().worlds.length > 0);
    job.stop();
    expect(job.trends().worlds[0]).toMatchObject({
      world: "gnoswap/pool",
      transactions: { now: 6 },
      addresses: { now: 2 },
    });
  });

  it("keeps each world's window in the habit files it is given, the busiest of each hour, for the next 14 days (7t3)", async () => {
    let reads = 0;
    const counting = chainRoutes([POOL], {
      indexer: () => {
        reads += 1;
        return history(6 * reads, POOL);
      },
    });
    const chain = fakeChain(counting);
    const folder = join(fresh(), "..");
    const habits = {
      transactions: join(folder, "trends-transactions.json"),
      addresses: join(folder, "trends-addresses.json"),
    };
    const job = startWorlds({ ...base, ...quick, send: chain.send, file: fresh(), universe, everyMs: 20, habits });
    await until(() => job.trends().worlds.length > 0);
    job.stop();
    const kept = (habit: string) => makePresence({ file: habit, now: Date.now }).history("gnoswap/pool").at(-1)?.people;
    expect(kept(habits.transactions)).toBe(6);
    expect(kept(habits.addresses)).toBe(2);
  });

  it("writes its habits as it stops, where it was told, though no pass wrote a window (7t3)", () => {
    const folder = join(fresh(), "..");
    const habits = {
      transactions: join(folder, "trends-transactions.json"),
      addresses: join(folder, "trends-addresses.json"),
    };
    const job = startWorlds({ ...base, file: fresh(), universe, habits });
    job.stop();
    expect(
      readdirSync(folder)
        .filter((name) => name.startsWith("trends-"))
        .sort(),
    ).toEqual(["trends-addresses.json", "trends-transactions.json"]);
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
