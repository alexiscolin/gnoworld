import { describe, expect, it } from "vitest";
import { listOf } from "./Dms.tsx";

const ALICE = "g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv";
const BOB = "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5";
const CAROL = "g1pery0j3xzn6wm5m3w8sxkmyafmnd6cle4s3er";

// 4e: the navigation's list of conversations.
describe("the direct messages' list", () => {
  // 4e's UX review (U19): the list followed first contact, not the latest line.
  it("lists the conversations heard last first, the store keeping them oldest first", () => {
    expect(listOf([ALICE, BOB], undefined)).toEqual([BOB, ALICE]);
  });

  it("lists the conversation in view first though none was heard yet, and once", () => {
    expect(listOf([ALICE, BOB], CAROL)).toEqual([CAROL, BOB, ALICE]);
    expect(listOf([ALICE, BOB], ALICE)).toEqual([BOB, ALICE]);
  });
});
