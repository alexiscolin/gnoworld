import { describe, expect, it } from "vitest";
import { MAX_SAVE_BYTES, saveRefusal, saveTooBig } from "./saveGuard.ts";

describe("saveRefusal: only the recording page itself may save (F5650, F5653)", () => {
  it.each([
    ["localhost", "http://localhost:8765", "localhost:8765"],
    ["127.0.0.1", "http://127.0.0.1:8765", "127.0.0.1:8765"],
    ["localhost for the origin, 127.0.0.1 for the host", "http://localhost:8765", "127.0.0.1:8765"],
  ])("lets a request through from %s", (_, origin, host) => {
    expect(saveRefusal(origin, host, 8765)).toBeUndefined();
  });

  it.each([
    ["no Origin", undefined, "localhost:8765"],
    ["no Host", "http://localhost:8765", undefined],
    ["another site's Origin", "https://evil.example", "localhost:8765"],
    ["a text/plain post from a page on another port", "http://localhost:3000", "localhost:8765"],
    ["an Origin on another port of 127.0.0.1", "http://127.0.0.1:8766", "127.0.0.1:8765"],
    ["https for the same host and port", "https://localhost:8765", "localhost:8765"],
    ["an Origin that only starts like ours", "http://localhost:8765.evil.example", "localhost:8765"],
    ["an Origin that only ends like ours", "http://evil.localhost:8765", "localhost:8765"],
    ["the opaque Origin null", "null", "localhost:8765"],
    ["a rebound DNS name for the Host", "http://localhost:8765", "evil.example:8765"],
    ["a rebound DNS name in both", "http://evil.example:8765", "evil.example:8765"],
    ["a Host with no port", "http://localhost:8765", "localhost"],
    ["a Host on another port", "http://localhost:8765", "localhost:8766"],
    ["an empty Origin and Host", "", ""],
  ])("refuses %s with 403", (_, origin, host) => {
    expect(saveRefusal(origin, host, 8765)).toBe(403);
  });
});

describe("saveTooBig: a save is capped at 1 MB", () => {
  it("takes 1 MB and refuses one byte more with 413", () => {
    expect(MAX_SAVE_BYTES).toBe(1_048_576);
    expect(saveTooBig(MAX_SAVE_BYTES)).toBeUndefined();
    expect(saveTooBig(MAX_SAVE_BYTES + 1)).toBe(413);
    expect(saveTooBig(0)).toBeUndefined();
  });
});
