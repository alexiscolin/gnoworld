import { describe, expect, it } from "vitest";
import { pinnedNode } from "./toolchain.ts";

// Every test run on the Node .node-version pins, StrykerJS's dry run too: another V8 reads some regexes otherwise
// (F816 came from StrykerJS on Homebrew's Node 26), and its results would be of a toolchain nobody ships.
describe("the toolchain", () => {
  it("runs on the Node .node-version pins", () => {
    expect(process.version).toBe(pinnedNode());
  });
});
