import { describe, expect, it } from "vitest";
import type { Ran } from "./gnomcp.ts";
import { noteRead, type Reads } from "./loopParts.ts";

// A question with a `finds`: only a gno_read of the asked realm whose code declares the function by that name counts.
const REALM = "gno.land/r/demo/poll";
const reads = (finds: Reads["finds"] = { realm: REALM, name: "Vote" }): Reads => ({
  finds,
  failed: false,
  found: false,
});
const code = (text: string): Ran => ({ ok: true, isError: false, text });
const read = (path = REALM) => ({ name: "gno_read", args: { path } });
const found = (text: string) => {
  const noted = reads();
  noteRead(noted, read(), code(text));
  return noted.found;
};

describe("a function a realm's code declares", () => {
  it.each([
    ["a line of its own among others", "package poll\n\nfunc Vote(cur realm) {}\n"],
    ["a method", "func (p *Poll) Vote(id int) {}"],
    ["a line after a commented one", "// func Vote(\nfunc Vote() {}"],
    ["a line with a comment after it", "func Vote() { // counts the vote"],
    ["a line whose star is no comment", "x := 2 * 3; func Vote() {}"],
  ])("is found on %s", (_name, text) => {
    expect(found(text)).toBe(true);
  });

  it.each([
    ["a line comment", "// func Vote() {}"],
    ["a block comment's start", "/* func Vote() {} */"],
    ["a block comment's line", " * func Vote() {}"],
    ["a block comment's line, indented by two spaces", "  * func Vote() {}"],
    ["a block comment's line, with no indent", "* func Vote() {}"],
    ["another name", "func Votes() {}"],
    ["no function at all", "package poll\nvar vote = 1\n"],
  ])("is not found on %s", (_name, text) => {
    expect(found(text)).toBe(false);
  });
});

describe("the reads noted of a question", () => {
  it("counts no call but gno_read, even a failed one, of a question with a `finds`", () => {
    const noted = reads();
    const failed: Ran = { ok: false, reason: "timeout" };
    expect(noteRead(noted, { name: "gno_eval", args: { path: REALM } }, failed)).toBe(failed);
    expect(noted).toMatchObject({ failed: false, found: false });
  });

  it("counts no read of a question with no `finds`, and does not fail on one", () => {
    const noted: Reads = { finds: undefined, failed: false, found: false };
    const failed: Ran = { ok: false, reason: "timeout" };
    expect(noteRead(noted, read(), failed)).toBe(failed);
    expect(noted).toMatchObject({ failed: false, found: false });
  });

  it("fails on a read that failed or errored, and finds nothing in another realm's code", () => {
    const noted = reads();
    noteRead(noted, read(), { ok: true, isError: true, text: "func Vote() {}" });
    expect(noted).toMatchObject({ failed: true, found: false });
    const other = reads();
    noteRead(other, read("gno.land/r/demo/other"), code("func Vote() {}"));
    expect(other).toMatchObject({ failed: false, found: false });
  });
});
