import { describe, expect, it } from "vitest";
import { abciRefused, fakeChain, RPC, type Routes } from "../testing/fakeWorldsChain.ts";
import { readPackages, type PackageFacts } from "./packages.ts";

// The shape of vm/qdoc is the source's (json_doc.go:18-28 at v1.5.0), not a recording: gnomcp has no route to it, so the first
// live proof is deploy/test.sh. The deployer is the [addpkg] creator the chain stamps into gnomod.toml, read with vm/qfile.
const CREATOR = "g10ragdr3cjqkael8rslpw4y6rlelhev4h0fswcx";
const WUGNOT = "gno.land/r/gnoland/wugnot";
const ARENA = "gno.land/r/g10ragdr3cjqkael8rslpw4y6rlelhev4h0fswcx/arena";

const doc = (over: Record<string, unknown> = {}): string =>
  JSON.stringify({
    package_path: WUGNOT,
    package_line: "package wugnot",
    package_doc: "Wrapped GNOT.",
    imports: ["gno.land/p/nt/grc20", "gno.land/p/nt/ufmt", "gno.land/r/nt/grc20reg", "strings"],
    bugs: [],
    values: [],
    funcs: [
      { type: "", name: "Transfer", crossing: true, signature: "func Transfer()", doc: "", params: [], results: [] },
      { type: "", name: "BalanceOf", crossing: false, signature: "func BalanceOf()", doc: "", params: [], results: [] },
      { type: "Token", name: "Method", crossing: false, signature: "", doc: "", params: [], results: [] },
      { type: "", name: "helper", crossing: false, signature: "", doc: "", params: [], results: [] },
    ],
    types: [],
    ...over,
  });
const gnomod = (creator = CREATOR, height = 298006): string =>
  `module = "x"\ngno = "0.9"\n\n[addpkg]\n  creator = "${creator}"\n  height = ${String(height)}\n`;

const routes = (over: Routes = {}): Routes => ({ doc: () => doc(), file: () => gnomod(), ...over });
const read = (paths: string[], over: Routes = {}, known: Map<string, PackageFacts> = new Map()) => {
  const chain = fakeChain(routes(over));
  return { chain, done: readPackages({ send: chain.send, rpc: RPC, known }, paths) };
};

describe("readPackages", () => {
  it("reads a package's imports, exported functions and deployer, with one vm/qdoc and one vm/qfile", async () => {
    const { chain, done } = read([WUGNOT]);
    const facts = (await done).get(WUGNOT);
    expect(facts).toEqual({
      deployer: CREATOR,
      functions: ["BalanceOf", "Transfer"],
      imports: ["gno.land/p/nt/grc20", "gno.land/p/nt/ufmt", "gno.land/r/nt/grc20reg"],
    });
    expect(chain.asked.map(({ kind, data }) => `${kind} ${data}`).sort()).toEqual([
      `vm/qdoc ${WUGNOT}`,
      `vm/qfile ${WUGNOT}/gnomod.toml`,
    ]);
  });

  it("leaves out methods, unexported names and the standard library", async () => {
    const facts = (await read([WUGNOT]).done).get(WUGNOT);
    expect(facts?.functions).not.toContain("Method");
    expect(facts?.functions).not.toContain("helper");
    expect(facts?.imports).not.toContain("strings");
  });

  it("reads each package once: a path already known is not asked again, a new one is", async () => {
    const known = new Map<string, PackageFacts>([[WUGNOT, { deployer: CREATOR, functions: [], imports: [] }]]);
    const { chain, done } = read([WUGNOT, ARENA], {}, known);
    const result = await done;
    expect(chain.asked.every(({ data }) => data.startsWith(ARENA))).toBe(true);
    expect(result.get(WUGNOT)).toEqual({ deployer: CREATOR, functions: [], imports: [] });
    expect(result.has(ARENA)).toBe(true);
  });

  it("reads a path given twice once", async () => {
    const { chain, done } = read([WUGNOT, WUGNOT]);
    await done;
    expect(chain.asked.filter(({ kind }) => kind === "vm/qdoc")).toHaveLength(1);
  });

  it("asks one call at a time, never more", async () => {
    const chain = fakeChain(routes(), { delayMs: 2 });
    await readPackages({ send: chain.send, rpc: RPC, known: new Map() }, [WUGNOT, ARENA, `${ARENA}view`]);
    expect(chain.parallel()).toBe(1);
  });

  it("goes through the pace before each of its calls, and before none for a package it knows", async () => {
    let paced = 0;
    const chain = fakeChain(routes());
    const known = new Map<string, PackageFacts>([[ARENA, { deployer: null, functions: [], imports: [] }]]);
    const pace = () => Promise.resolve(void (paced += 1));
    await readPackages({ send: chain.send, rpc: RPC, known, pace }, [WUGNOT, ARENA]);
    expect(chain.asked).toHaveLength(2);
    expect(paced).toBe(2);
  });

  it("gives each call a positive, finite time limit and no credential", async () => {
    const { chain, done } = read([WUGNOT]);
    await done;
    for (const { ms, init } of chain.asked) {
      expect(ms).toBeGreaterThan(0);
      expect(ms).toBeLessThanOrEqual(30_000);
      expect(JSON.stringify(init.headers ?? {}).toLowerCase()).not.toMatch(/cookie|authorization/);
    }
  });

  it.each(["doc", "file"] as const)(
    "cancels a %s answer that never ends, without reading it to its end",
    async (which) => {
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
      const { done } = read([WUGNOT], { [which]: endless });
      const facts = (await done).get(WUGNOT);
      expect(pulled).toBeLessThan(100);
      // A doc that cannot be read leaves the package out; a file that cannot leaves it with no deployer.
      expect(facts === undefined).toBe(which === "doc");
      expect(facts?.deployer ?? null).toBeNull();
    },
  );

  it("keeps what it knew of the packages after the one where the network failed", async () => {
    const known = new Map<string, PackageFacts>([[ARENA, { deployer: CREATOR, functions: ["Play"], imports: [] }]]);
    const { done } = read([WUGNOT, ARENA], { doc: () => new TypeError("down") }, known);
    expect((await done).get(ARENA)?.functions).toEqual(["Play"]);
  });

  it("keeps a package whose gnomod holds no creator (a genesis package), with a null deployer", async () => {
    const { done } = read([WUGNOT], { file: () => 'module = "x"\n' });
    expect((await done).get(WUGNOT)?.deployer).toBeNull();
  });

  it("keeps a package whose vm/qfile was refused, with a null deployer and its doc", async () => {
    const { done } = read([WUGNOT], { file: () => abciRefused() });
    const facts = (await done).get(WUGNOT);
    expect(facts?.deployer).toBeNull();
    expect(facts?.functions).toEqual(["BalanceOf", "Transfer"]);
  });

  it("leaves a package out when its vm/qdoc is refused, so the next pass asks it again", async () => {
    const { done } = read([WUGNOT, ARENA], { doc: (path) => (path === WUGNOT ? abciRefused() : doc()) });
    const result = await done;
    expect(result.has(WUGNOT)).toBe(false);
    expect(result.has(ARENA)).toBe(true);
  });

  it.each([
    ["a creator that is no address", gnomod('g1"; drop table')],
    ["an upper-case address", gnomod(CREATOR.toUpperCase())],
    ["an address of 39 characters", gnomod(CREATOR.slice(1))],
    ["an address with b, i or o", gnomod(`${CREATOR.slice(0, 39)}b`)],
  ])("takes %s for no deployer", async (_name, file) => {
    expect((await read([WUGNOT], { file: () => file }).done).get(WUGNOT)?.deployer).toBeNull();
  });

  // gno's field is `json:"imports,omitempty"` (json_doc.go:22 at v1.5.0), and a slice with nothing in it is left out of the JSON.
  it.each([
    ["no imports key", () => JSON.stringify({ package_path: WUGNOT, funcs: [{ type: "", name: "Transfer" }] })],
    ["no funcs key", () => JSON.stringify({ package_path: WUGNOT, imports: ["gno.land/p/nt/ufmt"] })],
    ["a null funcs", () => JSON.stringify({ package_path: WUGNOT, imports: [], funcs: null })],
  ])("reads a doc with %s (omitted when empty), and keeps the package read", async (_name, make) => {
    const { done } = read([WUGNOT], { doc: make });
    const facts = (await done).get(WUGNOT);
    expect(facts?.deployer).toBe(CREATOR);
  });

  it("reads the functions of a doc with no imports key", async () => {
    const bare = JSON.stringify({ funcs: [{ type: "", name: "Transfer" }] });
    expect((await read([WUGNOT], { doc: () => bare }).done).get(WUGNOT)?.functions).toEqual(["Transfer"]);
  });

  describe("hostile answers", () => {
    it.each([
      ["not JSON", "<html>"],
      ["a JSON array", "[]"],
      ["imports that are no list", doc({ imports: "gno.land/p/x" })],
      ["funcs that are no list", doc({ funcs: { name: "Transfer" } })],
      ["a func with no name", doc({ funcs: [{ type: "" }] })],
    ])("leaves the package out for %s, and does not throw", async (_name, answer) => {
      expect((await read([WUGNOT], { doc: () => answer }).done).has(WUGNOT)).toBe(false);
    });

    it("caps what one package may add: functions, imports and the length of each name", async () => {
      const funcs = Array.from({ length: 5_000 }, (_, i) => ({ type: "", name: `F${String(i)}`, crossing: false }));
      const imports = Array.from({ length: 5_000 }, (_, i) => `gno.land/p/x/p${String(i)}`);
      const longName = { type: "", name: `F${"a".repeat(300)}`, crossing: false };
      const facts = (await read([WUGNOT], { doc: () => doc({ funcs: [longName, ...funcs], imports }) }).done).get(
        WUGNOT,
      );
      expect(facts?.functions.length).toBeLessThanOrEqual(256);
      expect(facts?.imports.length).toBeLessThanOrEqual(256);
      expect(facts?.functions.every((name) => name.length <= 128)).toBe(true);
    });

    it("refuses an answer past the size cap, without reading its package_doc", async () => {
      const big = doc({ package_doc: "x".repeat(5 * 1024 * 1024) });
      expect((await read([WUGNOT], { doc: () => big }).done).has(WUGNOT)).toBe(false);
    });

    it("keeps an import that is no package path out of the file", async () => {
      const bad = doc({ imports: ["gno.land/p/ok/pkg", "<script>", "gno.land/p/../x", "javascript:alert(1)"] });
      expect((await read([WUGNOT], { doc: () => bad }).done).get(WUGNOT)?.imports).toEqual(["gno.land/p/ok/pkg"]);
    });

    it("stops asking for the pass when the network is down, not once a package", async () => {
      const chain = fakeChain(routes({ doc: () => new TypeError("fetch failed") }));
      const result = await readPackages({ send: chain.send, rpc: RPC, known: new Map() }, [
        WUGNOT,
        ARENA,
        `${ARENA}view`,
      ]);
      expect(result.size).toBe(0);
      expect(chain.asked.length).toBeLessThanOrEqual(2);
    });
  });

  it("reads the answer through the chain's envelope, so a bare body is no answer", async () => {
    const { done } = read([WUGNOT], { doc: () => new Response(doc()) });
    expect((await done).has(WUGNOT)).toBe(false);
  });
});
