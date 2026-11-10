import { describe, expect, it } from "vitest";
import { rollupName } from "./rollupName.ts";

// A realm's rollup file (slice 13a) is named by its path's hash, the same on the server that writes it and in the browser that reads it.
describe("rollupName", () => {
  it("is the first 32 hex characters of the path's SHA-256", () => {
    // printf '%s' gno.land/r/gnops/valopers | shasum -a 256
    expect(rollupName("gno.land/r/gnops/valopers")).toBe("72369992988efe07f5d378324734feea");
  });

  it("holds no text of the path, and two paths give two names", () => {
    const [a, b] = [rollupName("gno.land/r/a/b"), rollupName("gno.land/r/a/c")];
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[0-9a-f]{32}$/);
  });

  it("names any ASCII text, a path that climbs folders included, and refuses one beyond ASCII: no realm path holds one", () => {
    // printf '' | shasum -a 256
    expect(rollupName("")).toBe("e3b0c44298fc1c149afbf4c8996fb924");
    expect(rollupName("../../etc/passwd")).toMatch(/^[0-9a-f]{32}$/);
    expect(() => rollupName("gno.land/r/é")).toThrow(RangeError);
  });
});
