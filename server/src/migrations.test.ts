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
