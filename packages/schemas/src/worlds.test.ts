import { describe, expect, it } from "vitest";
import { RealmPath, WORLD_NATURES, Worlds, WORLDS_CAPS, WORLDS_MAX_BYTES } from "./worlds.ts";

// The file the server's worlds job writes and every client reads (slice 7, 7c): worlds grouped from the chain's realm list, each
// realm with what was read of its package and its history. A null is a fact not read, never a zero. Everything in it came from
// a chain or an indexer, so every text is capped and every count is a whole number.
const ADDRESS = "g10ragdr3cjqkael8rslpw4y6rlelhev4h0fswcx";
const realm = (over: Record<string, unknown> = {}) => ({
  path: "gno.land/r/samcrew/memba_gov",
  deployer: ADDRESS,
  deployerName: "samcrew",
  functions: ["Propose", "Vote"],
  imports: ["gno.land/p/nt/avl/v0"],
  calls: 3,
  callers: 2,
  lastHeight: 244_713,
  ...over,
});
const file = (over: Record<string, unknown> = {}) => ({
  version: 1,
  universe: "onyx",
  updated: "2026-11-01T12:00:00.000Z",
  worlds: [{ id: "samcrew/memba", namespace: "samcrew", realms: [realm()] }],
  ...over,
});

const inRealm = (over: Record<string, unknown>) =>
  file({ worlds: [{ id: "a/b", namespace: "a", realms: [realm(over)] }] });

describe("RealmPath, the paths of gno.land's realms the job may write", () => {
  it.each([
    "gno.land/r/samcrew/memba_gov",
    "gno.land/r/a/b/v1",
    "gno.land/r/solo",
    "gno.land/r/nym-x1/x/daily/counter/v0",
  ])("takes %s", (path) => {
    expect(RealmPath.safeParse(path).success).toBe(true);
  });

  it("takes a namespace of 128 characters, the length of a Slug, and refuses one of 129", () => {
    expect(RealmPath.safeParse(`gno.land/r/${"a".repeat(128)}/b`).success).toBe(true);
    expect(RealmPath.safeParse(`gno.land/r/${"a".repeat(129)}/b`).success).toBe(false);
    expect(RealmPath.safeParse(`gno.land/r/${"a".repeat(129)}`).success).toBe(false);
  });

  it.each([
    "gno.land/p/nt/avl/v0",
    "evil.example/r/a/b",
    "gno.land/r/A/b",
    "gno.land/r/a/../b",
    "gno.land/r/a/foo_test",
    "gno.land/r/a/<b>",
    "gno.land/r/a\nb",
    "gno.land/r/",
    "gno.land/r/a//b",
    "",
  ])("refuses %j", (path) => {
    expect(RealmPath.safeParse(path).success).toBe(false);
  });
});

describe("Worlds", () => {
  it("takes the file the job writes", () => {
    expect(Worlds.parse(file()).worlds[0]?.realms[0]?.calls).toBe(3);
  });

  it("takes a world's first-seen time (null on a first pass) and its batch flag, and refuses a seen that is no time", () => {
    const world = (extra: Record<string, unknown>) =>
      file({ worlds: [{ id: "a/b", namespace: "a", realms: [], ...extra }] });
    expect(Worlds.safeParse(world({ seen: "2026-11-01T12:01:00.000Z", batch: true })).success).toBe(true);
    expect(Worlds.safeParse(world({ seen: null })).success).toBe(true);
    expect(Worlds.safeParse(world({ seen: "soon" })).success).toBe(false);
    expect(Worlds.safeParse(world({ batch: "yes" })).success).toBe(false);
  });

  it("takes a world's nature, read once by the job, or none (F4109)", () => {
    const world = (extra: Record<string, unknown>) =>
      file({ worlds: [{ id: "a/b", namespace: "a", realms: [], ...extra }] });
    expect(WORLD_NATURES.length).toBeGreaterThan(0);
    for (const nature of WORLD_NATURES) expect(Worlds.parse(world({ nature })).worlds[0]?.nature).toBe(nature);
    expect(Worlds.safeParse(world({ nature: null })).success).toBe(true);
    expect(Worlds.parse(world({})).worlds[0]).not.toHaveProperty("nature");
  });

  it("reads a nature it does not know as none known, and still reads the world: a newer job's or a dropped one", () => {
    const world = (extra: Record<string, unknown>) =>
      file({ worlds: [{ id: "a/b", namespace: "a", realms: [], ...extra }] });
    for (const nature of ["wizard", "Token", "name", "", 3, true]) {
      const parsed = Worlds.safeParse(world({ nature }));
      expect(parsed.success, String(nature)).toBe(true);
      expect(parsed.data?.worlds[0]?.nature, String(nature)).toBeUndefined();
    }
  });

  it("drops a key of a world it does not know, so an older reader reads a newer file, and nothing unchecked passes", () => {
    const parsed = Worlds.parse(file({ worlds: [{ id: "a/b", namespace: "a", realms: [], later: "<b>x</b>" }] }));
    expect(parsed.worlds).toHaveLength(1);
    expect(parsed.worlds[0]).not.toHaveProperty("later");
    expect(Object.keys(parsed.worlds[0] ?? {}).sort()).toEqual(["id", "namespace", "realms"]);
  });

  it("takes a realm whose package or history was not read, with nulls and empty lists", () => {
    const quiet = realm({
      deployer: null,
      deployerName: null,
      functions: [],
      imports: [],
      calls: null,
      callers: null,
      lastHeight: null,
    });
    expect(Worlds.safeParse(file({ worlds: [{ id: "a/b", namespace: "a", realms: [quiet] }] })).success).toBe(true);
  });

  it("takes no world at all: a chain with no realm", () => {
    expect(Worlds.safeParse(file({ worlds: [] })).success).toBe(true);
  });

  it.each([
    ["another version", file({ version: 2 })],
    ["no universe", file({ universe: undefined })],
    ["a time that is no ISO time", file({ updated: "yesterday" })],
    ["a world with no namespace", file({ worlds: [{ id: "a/b", realms: [realm()] }] })],
    ["a world id with markup", file({ worlds: [{ id: "<b>", namespace: "a", realms: [realm()] }] })],
    [
      "a realm path that is a package",
      file({ worlds: [{ id: "a/b", namespace: "a", realms: [realm({ path: "gno.land/p/a/b" })] }] }),
    ],
    [
      "a deployer that is no address",
      file({ worlds: [{ id: "a/b", namespace: "a", realms: [realm({ deployer: "<x>" })] }] }),
    ],
    ["a count that is negative", file({ worlds: [{ id: "a/b", namespace: "a", realms: [realm({ calls: -1 })] }] })],
    ["a count that is a fraction", file({ worlds: [{ id: "a/b", namespace: "a", realms: [realm({ calls: 1.5 })] }] })],
    [
      "a count that is Infinity as text",
      file({ worlds: [{ id: "a/b", namespace: "a", realms: [realm({ calls: "Infinity" })] }] }),
    ],
    [
      "a function name of 129 characters",
      file({ worlds: [{ id: "a/b", namespace: "a", realms: [realm({ functions: [`A${"b".repeat(128)}`] })] }] }),
    ],
    [
      "an unknown field on a realm",
      file({ worlds: [{ id: "a/b", namespace: "a", realms: [realm({ verdict: "scam" })] }] }),
    ],
    ["a namespace with markup", file({ worlds: [{ id: "a/b", namespace: "<i>", realms: [] }] })],
    ["a namespace of 129 characters", file({ worlds: [{ id: "a/b", namespace: "a".repeat(129), realms: [] }] })],
    ["a world id of 257 characters", file({ worlds: [{ id: `a/${"b".repeat(255)}`, namespace: "a", realms: [] }] })],
    ["a universe with markup", file({ universe: "<b>" })],
    ["a deployer name with markup", inRealm({ deployerName: "<script>" })],
    ["a deployer name of 129 characters", inRealm({ deployerName: "a".repeat(129) })],
    ["an empty deployer name", inRealm({ deployerName: "" })],
    ["an import with markup", inRealm({ imports: ["<img>"] })],
    ["an import that climbs", inRealm({ imports: ["gno.land/p/../x"] })],
    ["a function name that is not exported", inRealm({ functions: ["helper"] })],
    ["a function name with markup", inRealm({ functions: ["A<b>"] })],
    ["a path past 256 characters", inRealm({ path: `gno.land/r/a/${"b".repeat(250)}` })],
    ["a negative last height", inRealm({ lastHeight: -1 })],
    ["a fractional last height", inRealm({ lastHeight: 1.5 })],
    ["a last height past the safe integers", inRealm({ lastHeight: 2 ** 60 })],
    ["a negative caller count", inRealm({ callers: -1 })],
    ["a fractional caller count", inRealm({ callers: 0.5 })],
    ["a missing field on a realm", inRealm({ calls: undefined })],
    ["an unknown field on the file", file({ extra: 1 })],
  ])("refuses %s", (_name, body) => {
    expect(Worlds.safeParse(body).success).toBe(false);
  });

  it("takes a world whose id is its namespace alone: a realm that is its namespace and nothing else", () => {
    const solo = file({ worlds: [{ id: "solo", namespace: "solo", realms: [realm({ path: "gno.land/r/solo" })] }] });
    expect(Worlds.safeParse(solo).success).toBe(true);
  });

  describe("the caps, each accepted exactly and refused one over", () => {
    const world = { id: "a/b", namespace: "a", realms: [] };
    const filled = (length: number, item: unknown): unknown[] => Array.from({ length }, () => item);
    const cases: [keyof typeof WORLDS_CAPS, (length: number) => unknown][] = [
      ["worlds", (length) => file({ worlds: filled(length, world) })],
      ["realms", (length) => file({ worlds: [{ ...world, realms: filled(length, realm()) }] })],
      ["functions", (length) => file({ worlds: [{ ...world, realms: [realm({ functions: filled(length, "A") })] }] })],
      [
        "imports",
        (length) => file({ worlds: [{ ...world, realms: [realm({ imports: filled(length, "gno.land/p/a/b") })] }] }),
      ],
      ["name", (length) => file({ worlds: [{ ...world, realms: [realm({ deployerName: "a".repeat(length) })] }] })],
    ];

    it.each(cases)("%s", (key, build) => {
      expect(Worlds.safeParse(build(WORLDS_CAPS[key])).success).toBe(true);
      expect(Worlds.safeParse(build(WORLDS_CAPS[key] + 1)).success).toBe(false);
    });
  });

  it("holds a file for the recorded scale well inside the byte cap, and a cap a client can read", () => {
    const realms = Array.from({ length: 743 }, (_, i) =>
      realm({ path: `gno.land/r/ns${String(i)}/app`, functions: Array.from({ length: 30 }, () => "Transfer") }),
    );
    const size = JSON.stringify(file({ worlds: [{ id: "a/b", namespace: "a", realms }] })).length;
    expect(size).toBeLessThan(WORLDS_MAX_BYTES / 4);
    expect(WORLDS_MAX_BYTES).toBeLessThanOrEqual(16 * 1024 * 1024);
  });

  it("holds the caps the plan names: 10,000 worlds at least, and a name of 128 characters", () => {
    expect(WORLDS_CAPS.worlds).toBeGreaterThanOrEqual(10_000);
    expect(WORLDS_CAPS.name).toBe(128);
  });
});
