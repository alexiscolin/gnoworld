import type { Worlds } from "@gnoworld/schemas/indexer";
import { describe, expect, it } from "vitest";
import { deployerLabel, heldOf, importersOf, realmsOf } from "./worldsIndex.ts";

type Realm = Worlds["worlds"][number]["realms"][number];
const realm = (path: string, imports: string[], over: Partial<Realm> = {}): Realm =>
  ({ path, imports, deployer: null, deployerName: null, ...over }) as Realm;
const worlds = (...sets: Realm[][]): Worlds["worlds"] =>
  sets.map((realms, at) => ({ world: `w${String(at)}`, realms })) as unknown as Worlds["worlds"];

describe("deployerLabel", () => {
  it("is the name the file gives, else the short address", () => {
    expect(deployerLabel("gnoland", "g1abcdefghijklmnopqrstuvwxyz0123456789ab")).toBe("gnoland");
    expect(deployerLabel(null, "g1abcdefghijklmnopqrstuvwxyz0123456789ab")).toMatch(/^g1.+…/u);
    expect(deployerLabel(undefined, "g1abcdefghijklmnopqrstuvwxyz0123456789ab")).toMatch(/^g1.+…/u);
  });
});

describe("the worlds' file, indexed once", () => {
  const file = worlds([realm("r/a", ["p/x", "r/b"]), realm("r/b", ["p/x"])], [realm("r/c", ["r/b", "r/b"])]);
  it("flattens the realms once per file, in the file's order", () => {
    expect(realmsOf(file).map((each) => each.path)).toEqual(["r/a", "r/b", "r/c"]);
    expect(realmsOf(file)).toBe(realmsOf(file));
  });
  it("finds a realm by its path, and counts the realms that import one, a realm once", () => {
    expect(heldOf(file, "r/b")?.path).toBe("r/b");
    expect(heldOf(file, "r/zz")).toBeUndefined();
    expect(importersOf(file, "r/b")).toBe(2);
    expect(importersOf(file, "p/x")).toBe(2);
    expect(importersOf(file, "r/none")).toBe(0);
  });
});
