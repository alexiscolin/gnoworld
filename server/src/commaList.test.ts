import { describe, expect, it } from "vitest";
import { z } from "zod";
import { commaList } from "./commaList.ts";

describe("commaList", () => {
  const ids = commaList(z.string().regex(/^[a-z]+$/), 3);

  it("reads 1 to max items, each by its schema", () => {
    expect(ids.parse("a")).toEqual(["a"]);
    expect(ids.parse("a,b,c")).toEqual(["a", "b", "c"]);
  });

  it.each(["", "a,", ",a", "a,,b", "a,b,c,d", "a,B"])("refuses %j whole", (list) => {
    expect(ids.safeParse(list).success).toBe(false);
  });
});
