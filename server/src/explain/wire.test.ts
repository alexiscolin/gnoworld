import { describe, expect, it } from "vitest";
import { isKnown } from "./wire.ts";

const listed = () => new Set(["gno.land/r/demo/a"]);
const known = isKnown("onyx-1", listed);

describe("the subjects that are made", () => {
  it("is a listed realm of the default universe's chain", () => {
    expect(known({ kind: "realm", chain: "onyx-1", subject: "gno.land/r/demo/a" })).toBe(true);
  });

  it("is never another chain, nor a path the worlds file does not list", () => {
    expect(known({ kind: "realm", chain: "gnoland-1", subject: "gno.land/r/demo/a" })).toBe(false);
    expect(known({ kind: "realm", chain: "onyx-1", subject: "gno.land/r/evil/x" })).toBe(false);
  });
});
