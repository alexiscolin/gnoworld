import { describe, expect, it } from "vitest";
import { cappedBytes, type ByteReader } from "./capped.ts";

// A reader of these chunks, then done; what it cancelled, and how often it was read, are kept.
function readerOf(chunks: readonly Uint8Array[], faults: { read?: Error; cancel?: Error } = {}) {
  const left = [...chunks];
  const seen = { reads: 0, cancels: 0 };
  const reader: ByteReader = {
    read() {
      seen.reads += 1;
      const value = left.shift();
      if (value !== undefined) return Promise.resolve({ done: false, value });
      return faults.read === undefined ? Promise.resolve({ done: true }) : Promise.reject(faults.read);
    },
    cancel() {
      seen.cancels += 1;
      return faults.cancel === undefined ? Promise.resolve() : Promise.reject(faults.cancel);
    },
  };
  return { reader, seen };
}

describe("cappedBytes", () => {
  it("joins the chunks in order, up to the cap exactly", async () => {
    const { reader, seen } = readerOf([Uint8Array.of(1, 2), Uint8Array.of(3)]);
    expect(await cappedBytes(reader, 3)).toEqual(Uint8Array.of(1, 2, 3));
    expect(seen.cancels).toBe(0);
  });

  it("gives no bytes for a stream with none", async () => {
    expect(await cappedBytes(readerOf([]).reader, 0)).toEqual(new Uint8Array());
  });

  it("is null at the chunk that passes the cap, the reader cancelled there and read no further", async () => {
    const { reader, seen } = readerOf([Uint8Array.of(1, 2), Uint8Array.of(3), Uint8Array.of(4)]);
    expect(await cappedBytes(reader, 2)).toBeNull();
    expect(seen).toEqual({ reads: 2, cancels: 1 });
  });

  it("is null past the cap when its cancel is refused too", async () => {
    const refused = readerOf([new Uint8Array(4)], { cancel: new Error("closed") });
    expect(await cappedBytes(refused.reader, 3)).toBeNull();
  });

  it("lets a read that fails rise, for its caller to name", async () => {
    const fault = new Error("stalled");
    await expect(cappedBytes(readerOf([Uint8Array.of(1)], { read: fault }).reader, 8)).rejects.toBe(fault);
  });
});
