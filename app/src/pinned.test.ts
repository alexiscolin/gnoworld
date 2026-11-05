import { describe, expect, test } from "vitest";
import { pinnedOf, realmViewOf } from "./pinned.ts";

// 9e-1 (D271): a world's pinned actions, each with the realm view of its own realm in the world's universe, where the chat's link and
// the chain the action is read and signed on come from: never the world's first realm's.
describe("a world's pinned actions", () => {
  const A = "gno.land/r/demo/a";
  const B = "gno.land/r/demo/b";
  const rows = () => [
    { label: "Join", realm: A, function: "Join", args: {} },
    { label: "Grant", realm: B, function: "Grant", args: { to: "g1x" } },
  ];

  test("gives each action of the default universe's world the view of its own realm, the second's too", () => {
    expect(pinnedOf(rows(), { id: "onyx", isDefault: true })).toEqual([
      { label: "Join", action: { realm: A, function: "Join", args: {} }, view: "/r/demo/a" },
      { label: "Grant", action: { realm: B, function: "Grant", args: { to: "g1x" } }, view: "/r/demo/b" },
    ]);
  });

  test("gives an action of another universe's world its view under /net/<universe>", () => {
    expect(pinnedOf(rows(), { id: "gnoland", isDefault: false }).map((each) => each.view)).toEqual([
      "/net/gnoland/r/demo/a",
      "/net/gnoland/r/demo/b",
    ]);
  });

  test("names a realm's view by the path after gno.land/r/, nested paths whole", () => {
    expect(realmViewOf({ id: "onyx", isDefault: true }, "gno.land/r/gov/dao/v3")).toBe("/r/gov/dao/v3");
  });
});
