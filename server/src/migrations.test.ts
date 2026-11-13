import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { migrations } from "./migrations.ts";

// Append-only: one SHA-256 for each migration, in the order they ran. A new migration adds its hash here
// last; a merge of two branches that both append conflicts on this list, so the order is chosen, not lost.
const PINNED: readonly string[] = [
  "ec5cc733cf99c260a3bc790df84fef2aa7481df8e15ec79f7f858bc010bddb6a",
  "3ca851de38c24b813b8ca81c15b8f4016ec8bb8a68af16d5f10af978f520140d",
  "45ef30eb4993c92abdd55389587b334806f2650db40ee545da26f69fbf8996c7",
  "6d121ea6481b976c6775cab71663c2062444a43ad578c362ee1b8391de0cb544",
  "ef81395b8716df68e92b35f4d36c185f0b2ba35aa5637be631ba1361b7442842",
  "4962c8aadf4538e9935e44215b989b53a5149c7d86cf244de95fa08c1f1fe3d4",
  "df030c0eb093b6ae5c1d2addbf038b51e638fc7a2da0d5eead29191a6eaa1132",
  "8c96de5c1b8463000e72df5de7c5bb7d24d92a3e5d2e42e9d9d308abcf552f5f",
  "82f9cf931af49d7f9d85de99427cab37cea9e556cc4926b5f4d24fa0ef353d19",
  "4f63cf47fe8c39706fe35017c3ebf3dab531d356cba611ea9d46ff641a4458d8",
  "58abb58dbbb751d927051126218016d8accf84956138f4b9e54b6b0bc2089a64",
  "161cb1890d2c627e58d4f5161e1fbf63d5a05b9b249b086ec8d17c6f683eb561",
  "5ce8e1b44346a2ce9eaa3662f2b7227fc63073a6bcaf69bf2e91cf9d382e394c",
  "6aff3029117aca972db73676df546df5eab6b4da54343c6dcbd5c66a7d1c500c",
  "b01855bca82b6c88e116730ab1f7042f2c7f3d169e0b097af7b5b842ffd74f1f",
  "8774a55db571cef174e5fa48fb936848c870633e06c039e857b407eee3255d87",
  "3ee77132fdc9f76ec51cb282ee8702de7793ee9fe5cc4c58b210dac8321bd37e",
  "4ac4c47378d77d09bfab3eee8f828fe5d7f9c7a1aa05b24b84d29cf29fdb50a9",
  "f42984d468793c0ccba81ca9bf9071392ab423bac612f3056d7f1abf87b0a2ee",
  "3a53d82f32aed479e01307ac5590779a2cb6902b62ee86e4a1961deb87aafef0",
  "fe71ebacb7645e6573c6c506f27d5f050535dca4c9359fc2ca7061e174c6cbde",
  "90ea0fd119c2f9fe6ea509f9021ea9a135d771b56355c906669bc9568ce136b9",
  "b41daa670ede1a3d257d1dc62cbf6885a2b4b619449880b3b7435c8a3fe416a8",
  "28653aed145d3281ca0c2e4dda2d0225fe9c07e4fc61e0c87981ffde4df4a2c6",
  "fdcdaf4ca02338d609c2c8f376d0fdae1fac845cdf1cb19cb69425a0d86ce1e5",
  "a15cef1020113da6ab11b5d31bf6f2aa4cf5faa57a37bb71ee475bedea86e54c",
  "c580e65bbf9125b410e906159ff07d337f781dfe24b7be448117abd4a5ad072d",
  "6dca03d0d59a6d7ad98b97e8dc47bbbe58767be180017a8b2b11fd94c5fea9ed",
  "de9adce55a8df24cb5005d3b97aaeebf991dbbf1d610b7efb7ffffef82e64336",
  "12971173f4bf4a2df44fa0dd0f9f056898460d82ae69179234d73407df5e3b34",
  "3b078fa5616921aadf0bc85333fdb75534fafab9744dd8db75ed93ae9e8542a0",
  "c222b625fd7958f92dabcf6655df3c3b72581adaf0a2286a145b578f96e4fecd",
  "ad069afedb3f470712aa5819dc93d160c14e209fd6ea7c835ae05db953117260",
];

const sha = (text: string): string => createHash("sha256").update(text).digest("hex");

// What is wrong with `list` against `pinned`: the first entry that differs, or the count that does not match.
function problems(list: readonly string[], pinned: readonly string[]): string[] {
  const found: string[] = [];
  for (const [at, hash] of pinned.entries()) {
    if (list[at] === undefined) found.push(`migration ${String(at)} is gone`);
    else if (sha(list[at]) !== hash)
      found.push(`migration ${String(at)} was edited, moved or preceded by an insertion`);
  }
  for (let at = pinned.length; at < list.length; at += 1)
    found.push(`migration ${String(at)} is not pinned: append ${sha(list[at] ?? "")} to PINNED`);
  return found;
}

describe("the migrations", () => {
  it("are the ones pinned, each unchanged, in its place, with none added unpinned (F2051)", () => {
    expect(problems(migrations, PINNED)).toEqual([]);
  });

  const pinned = ["CREATE TABLE a (x INTEGER) STRICT;", "CREATE TABLE b (y INTEGER) STRICT;", "SELECT 1;"].map(sha);
  const list = ["CREATE TABLE a (x INTEGER) STRICT;", "CREATE TABLE b (y INTEGER) STRICT;", "SELECT 1;"];

  it("accept the list as pinned", () => {
    expect(problems(list, pinned)).toEqual([]);
  });

  it("refuse an edit of an applied entry", () => {
    expect(problems([list[0] ?? "", "CREATE TABLE b (y TEXT) STRICT;", list[2] ?? ""], pinned)).toHaveLength(1);
  });

  it("refuse a reorder", () => {
    expect(problems([list[1] ?? "", list[0] ?? "", list[2] ?? ""], pinned)).toHaveLength(2);
  });

  it("refuse an insertion, which moves every later entry", () => {
    expect(problems([list[0] ?? "", "SELECT 2;", ...list.slice(1)], pinned).length).toBeGreaterThan(0);
  });

  it("refuse a removal", () => {
    expect(problems(list.slice(0, 2), pinned)).toEqual(["migration 2 is gone"]);
  });

  it("refuse an entry added without its hash", () => {
    expect(problems([...list, "SELECT 3;"], pinned)).toHaveLength(1);
  });
});
