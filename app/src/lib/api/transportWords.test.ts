import { describe, expect, it } from "vitest";
import { transportWords } from "./transportWords.ts";

describe("the transport's words", () => {
  it("says a server down or out of reach in the feature's own sentence, and an answer it could not use in the one sentence", () => {
    const said = transportWords("Down.");
    expect([said.not_ready, said.unavailable, said.internal, said.network]).toEqual([
      "Down.",
      "Down.",
      "Down.",
      "Down.",
    ]);
    const unexpected = "Something unexpected came back. Please try again.";
    expect([said.malformed, said.unsupported, said.too_large]).toEqual([unexpected, unexpected, unexpected]);
  });
});
