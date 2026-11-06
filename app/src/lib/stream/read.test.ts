import { z } from "zod";
import { describe, expect, it } from "vitest";
import { read } from "./read.ts";

// An event's data: a text of the schema's shape, or nothing; what is no text is never read, whatever it would turn into.
describe("an event's data read", () => {
  it("gives the text's value when it is JSON of the schema's shape, and nothing otherwise", () => {
    expect(read('{"n":1}', z.object({ n: z.number() }))).toEqual({ n: 1 });
    expect(read('{"n":"x"}', z.object({ n: z.number() }))).toBeUndefined();
    expect(read("not json", z.object({ n: z.number() }))).toBeUndefined();
  });

  it("reads no data that is not a text, though it would turn into JSON that fits", () => {
    expect(read(5, z.number())).toBeUndefined();
    expect(read([7], z.number())).toBeUndefined();
    expect(read(new Uint8Array(0), z.unknown())).toBeUndefined();
  });
});
