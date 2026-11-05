import { describe, expect, it } from "vitest";
import { abciQueryOf } from "./abci.ts";

describe("abciQueryOf", () => {
  it("quotes the path, escaped whole, and carries the data as hex", () => {
    expect(abciQueryOf("vm/qrender", Uint8Array.of(0x67, 0x6e, 0x6f))).toBe(
      "/abci_query?path=%22vm%2Fqrender%22&data=0x676e6f",
    );
  });

  it("keeps a query inside the quoted path, as vm/qpaths takes its limit", () => {
    expect(abciQueryOf("vm/qpaths?limit=10", new Uint8Array())).toBe(
      "/abci_query?path=%22vm%2Fqpaths%3Flimit%3D10%22&data=0x",
    );
  });

  it("writes two digits a byte, a low byte with its zero", () => {
    expect(abciQueryOf("p", Uint8Array.of(0x0a, 0xff, 0x00))).toBe("/abci_query?path=%22p%22&data=0x0aff00");
  });
});
