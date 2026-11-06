import { describe, expect, it } from "vitest";
import { neighboursOf, type LinkedWorld } from "./links.ts";

// core/cosmos/links (slice 8's 8g): a plate's "Connected worlds", from the realms the file says import one another.

const r = (name: string) => `gno.land/r/${name}`;
const world = (id: string, realms: LinkedWorld["realms"]): LinkedWorld => ({ id, realms });

describe("neighboursOf", () => {
  it("is none for a world the file does not hold", () => {
    expect(neighboursOf([world("a", [{ path: r("a") }])], "zzz")).toEqual([]);
  });

  it("is none for a world nothing imports and that imports nothing", () => {
    expect(neighboursOf([world("a", [{ path: r("a") }]), world("b", [{ path: r("b") }])], "a")).toEqual([]);
  });

  it("marks a world that imports mine as calling, and one I import as called", () => {
    const worlds = [
      world("me", [{ path: r("me"), imports: [r("lib")] }]),
      world("lib", [{ path: r("lib") }]),
      world("user", [{ path: r("user"), imports: [r("me")] }]),
    ];
    expect(neighboursOf(worlds, "me")).toEqual([
      { id: "user", calls: true, called: false },
      { id: "lib", calls: false, called: true },
    ]);
  });

  it("lists a world once when the two import each other", () => {
    const worlds = [
      world("a", [{ path: r("a"), imports: [r("b")] }]),
      world("b", [{ path: r("b"), imports: [r("a")] }]),
    ];
    expect(neighboursOf(worlds, "a")).toEqual([{ id: "b", calls: true, called: true }]);
  });

  it("orders the ones that call first, then by id", () => {
    const worlds = [
      world("me", [{ path: r("me"), imports: [r("x"), r("c")] }]),
      world("x", [{ path: r("x") }]),
      world("c", [{ path: r("c") }]),
      world("z", [{ path: r("z"), imports: [r("me")] }]),
      world("b", [{ path: r("b"), imports: [r("me")] }]),
    ];
    expect(neighboursOf(worlds, "me").map(({ id }) => id)).toEqual(["b", "z", "c", "x"]);
  });

  it("ignores imports that are not realms, not in the file, or my own worlds", () => {
    const worlds = [
      world("me", [{ path: r("me"), imports: ["gno.land/p/lib", r("ghost"), r("me")] }, { imports: [r("me")] }]),
      world("o", [{ path: r("o"), imports: ["gno.land/p/me"] }]),
    ];
    expect(neighboursOf(worlds, "me")).toEqual([]);
  });

  it("gives a realm two worlds name to the first by id, whatever the order", () => {
    const shared = [{ path: r("dup") }];
    const user = world("u", [{ path: r("u"), imports: [r("dup")] }]);
    for (const order of [
      ["a", "b"],
      ["b", "a"],
    ]) {
      const worlds = [user, ...order.map((id) => world(id, shared))];
      expect(neighboursOf(worlds, "u")).toEqual([{ id: "a", calls: false, called: true }]);
    }
  });

  it("holds a realm with no path without naming it", () => {
    const worlds = [world("a", [{ imports: [r("b")] }]), world("b", [{}])];
    expect(neighboursOf(worlds, "b")).toEqual([]);
  });
});
