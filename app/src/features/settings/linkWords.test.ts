import { describe, expect, it } from "vitest";
import { LINKED_ELSEWHERE, linkProblem, refusalWords } from "./linkWords.ts";

// What a refused verify says, by flow: a link's 403 is an account in another identity; a release's 403 is only the guard's Origin refusal, and its 429
// is a network that asked too much.
describe("the words of a refused verify", () => {
  it("says a link's 403 is an account linked elsewhere", () => {
    expect(refusalWords("link", "forbidden")).toBe(LINKED_ELSEWHERE);
  });
  it("never speaks of linking in a release's 403: the guard's own sentence", () => {
    expect(refusalWords("release", "forbidden")).toBe(linkProblem("forbidden"));
    expect(refusalWords("release", "forbidden")).not.toMatch(/linked/i);
  });
  it("tells a release's 429 to wait or change network", () => {
    expect(refusalWords("release", "too_many")).toBe(
      "Too many tries from this network: wait a few minutes, or try from another network.",
    );
  });
  it("keeps a link's 429 as it was", () => {
    expect(refusalWords("link", "too_many")).toBe(linkProblem("too_many"));
  });
});
