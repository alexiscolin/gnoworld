import { describe, expect, it } from "vitest";
import { bodyOf, feedOf } from "./body.ts";
import { Refused } from "./fetch.ts";

const CHUNKED = { "transfer-encoding": "chunked" };

describe("a chunked body's size line", () => {
  it("refuses a size line past 1 KiB with no newline as a network fault, and reads no further", async () => {
    let pulled = 0;
    async function* noNewline(): AsyncGenerator<Buffer> {
      for (; pulled < 64;) {
        pulled += 1;
        yield Buffer.alloc(1024, "a");
        await Promise.resolve();
      }
    }
    const signal = new AbortController().signal;
    const body = bodyOf(feedOf(noNewline(), Buffer.from("1"), signal), CHUNKED, signal);
    const got = await body.next().catch((error: unknown) => error);
    expect(got).toBeInstanceOf(Refused);
    expect(got instanceof Refused ? got.kind : undefined).toBe("network");
    expect(pulled).toBeLessThanOrEqual(2);
  });

  it("reads a size line of 1 KiB with its extension, just under the cap", async () => {
    async function* rest(): AsyncGenerator<Buffer> {
      yield Buffer.from(`;${"e".repeat(1018)}\r\nhello\r\n0\r\n\r\n`);
      await Promise.resolve();
    }
    const signal = new AbortController().signal;
    const parts: Uint8Array[] = [];
    for await (const part of bodyOf(feedOf(rest(), Buffer.from("5"), signal), CHUNKED, signal)) parts.push(part);
    expect(Buffer.concat(parts).toString()).toBe("hello");
  });
});
