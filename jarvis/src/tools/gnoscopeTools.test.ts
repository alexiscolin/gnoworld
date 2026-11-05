import { describe, expect, it } from "vitest";
import { z } from "zod";
import { allowlist } from "../allowlist.ts";
import { recordedTools } from "../testing/fakeGnoscope.ts";
import { capture } from "../testing/kit.ts";
import { gnoscopeTools } from "./gnoscopeTools.ts";

// ADR-0002 section 5: gnoscope's tools behind its switch, "a transaction explained, a realm's decoded state, an address,
// search over all code on chain", each with our own strict schema. Builders make each value inside the test (F2356).
// An address whose bech32 checksum holds (packages/schemas' Address takes it).
const ADDRESS = "g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv";
const HASH = "puQt1uwsMBxvUYhpdTvQ5KIF/zUlWxHuWrcuV1axdYw=";
const good = () => ({
  explain_tx: { network: "onyx", hash: HASH },
  get_realm_state: { network: "onyx", path: "gno.land/r/gov/dao" },
  get_address: { network: "mainnet", address: ADDRESS },
  search_code: { network: "onyx", query: '"func Render"', kind: "realm", limit: 25 },
});
const table = () => allowlist(gnoscopeTools(["onyx", "mainnet"]), capture().log);
const Listed = z.object({ name: z.string(), inputSchema: z.object({ properties: z.record(z.string(), z.unknown()) }) });

describe("gnoscopeTools: four of gnoscope's reads, each with our own schema", () => {
  it("names the four reads ADR-0002 takes of gnoscope's seven, in its order", () => {
    expect(gnoscopeTools(["onyx"]).map(({ name }) => name)).toEqual([
      "explain_tx",
      "get_realm_state",
      "get_address",
      "search_code",
    ]);
  });

  it("asks no field gnoscope's recorded tools lack, and describes each one", () => {
    const theirs = new Map(
      recordedTools().map((tool) => {
        const { name, inputSchema } = Listed.parse(tool);
        return [name, Object.keys(inputSchema.properties)];
      }),
    );
    for (const { name, args } of gnoscopeTools(["onyx"])) {
      for (const field of Object.keys(args.shape)) expect(theirs.get(name)).toContain(field);
      for (const field of Object.values(args.shape)) expect(field.description).toMatch(/\S/);
    }
  });

  it("never offers get_realm_state's wider read, which a public node nobody funds pays for", () => {
    const [, state] = gnoscopeTools(["onyx"]);
    expect(Object.keys(state?.args.shape ?? {})).toEqual(["network", "path"]);
    expect(table().check("get_realm_state", { ...good().get_realm_state, full: true })).toEqual({
      ok: false,
      reason: "bad_arguments",
    });
  });

  it("takes each read's arguments at their bounds", () => {
    const tools = table();
    for (const [name, input] of Object.entries(good())) expect(tools.check(name, input).ok).toBe(true);
    expect(tools.check("explain_tx", { network: "onyx", hash: "a".repeat(128) }).ok).toBe(true);
    expect(tools.check("search_code", { network: "onyx", query: "q".repeat(200) }).ok).toBe(true);
    expect(tools.check("search_code", { network: "onyx", query: "Render", limit: 1 }).ok).toBe(true);
    expect(tools.check("search_code", { network: "onyx", query: "Render", kind: "package" }).ok).toBe(true);
    expect(tools.check("get_realm_state", { network: "onyx", path: `gno.land/r/${"a".repeat(245)}` }).ok).toBe(true);
  });

  it.each([
    ["an extra field", "explain_tx", () => ({ ...good().explain_tx, raw: true })],
    ["no network, gnoscope's every chain", "explain_tx", () => ({ hash: HASH })],
    ["a network not listed", "get_address", () => ({ network: "testnet", address: ADDRESS })],
    ["a hash with a space", "explain_tx", () => ({ network: "onyx", hash: `${HASH} x` })],
    ["a hash past 128 characters", "explain_tx", () => ({ network: "onyx", hash: "a".repeat(129) })],
    ["an empty hash", "explain_tx", () => ({ network: "onyx", hash: "" })],
    ["a path out of gno.land/r/", "get_realm_state", () => ({ network: "onyx", path: "gno.land/p/demo/avl" })],
    ["a path without its prefix", "get_realm_state", () => ({ network: "onyx", path: "r/gov/dao" })],
    [
      "a path with words before gno.land/r/",
      "get_realm_state",
      () => ({ network: "onyx", path: "evil/gno.land/r/gov/dao" }),
    ],
    [
      "a path with a character after its last word",
      "get_realm_state",
      () => ({ network: "onyx", path: "gno.land/r/gov/dao!" }),
    ],
    [
      "a path past 256 characters",
      "get_realm_state",
      () => ({ network: "onyx", path: `gno.land/r/${"a".repeat(246)}` }),
    ],
    ["an address in capitals", "get_address", () => ({ network: "onyx", address: ADDRESS.toUpperCase() })],
    [
      "an address with a wrong checksum",
      "get_address",
      () => ({ network: "onyx", address: `${ADDRESS.slice(0, -1)}q` }),
    ],
    ["an address of 39 characters", "get_address", () => ({ network: "onyx", address: ADDRESS.slice(0, -1) })],
    ["an empty query", "search_code", () => ({ network: "onyx", query: "" })],
    ["a query past 200 characters", "search_code", () => ({ network: "onyx", query: "q".repeat(201) })],
    ["another kind", "search_code", () => ({ network: "onyx", query: "Render", kind: "pure" })],
    ["a limit of 0", "search_code", () => ({ network: "onyx", query: "Render", limit: 0 })],
    ["a limit of 26", "search_code", () => ({ network: "onyx", query: "Render", limit: 26 })],
    ["a limit of 1.5", "search_code", () => ({ network: "onyx", query: "Render", limit: 1.5 })],
    ["an ill-typed field", "get_realm_state", () => ({ network: "onyx", path: 42 })],
  ])("refuses %s", (_case, name, input) => {
    expect(table().check(name, input())).toEqual({ ok: false, reason: "bad_arguments" });
  });

  it("tells the model that gnoscope explains, a figure stands once gnomcp's read agrees, and down it answers from gnomcp", () => {
    for (const { description } of gnoscopeTools(["onyx"])) {
      expect(description).toContain(
        "gnoscope, a third party, explains: a figure it gives is stated only once a gnomcp read agrees.",
      );
      expect(description).toContain("If gnoscope is down or slow, say so and answer from gnomcp's reads.");
    }
  });

  it("tells the model what each read gives", () => {
    const words = gnoscopeTools(["onyx"]).map(({ name, description }) => [name, description.split(":")[0]]);
    expect(words).toEqual([
      ["explain_tx", "One transaction decoded by gnoscope"],
      [
        "get_realm_state",
        "A realm's live state, decoded by gnoscope from a node into a named tree of values; a large realm's comes back partial and says so. gnoscope, a third party, explains",
      ],
      ["get_address", "An account on chain described by gnoscope"],
      ["search_code", "Full-text search by gnoscope over every source file the chain stores"],
    ]);
  });

  it.each([[[]], [["Onyx"]], [["main net"]], [["n".repeat(41)]]])(
    "refuses to build for the networks %j",
    (networks) => {
      expect(() => gnoscopeTools(networks)).toThrow(/^gnoscope tools: /);
    },
  );
});
