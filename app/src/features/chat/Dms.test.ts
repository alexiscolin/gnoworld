import { describe, expect, it } from "vitest";
import type { Line } from "@gnoworld/core";
import { conversationOf, listOf, partnerOf } from "./Dms.tsx";

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

// 4e's late test audit (T3): the page's privacy rules were pure logic no unit test read; three journey mutants
// survived (a stranger's lines shown at ?dm=<stranger>, ?dm=<own address>).
describe("the conversation a page shows", () => {
  it.each([
    ["for a guest", undefined, BOB],
    ["when none is asked", ALICE, null],
    ["at the account's own address", ALICE, ALICE],
    ["at an address that is none", ALICE, "g1notanaddress"],
    ["at a nick", ALICE, "guest-ab12cd"],
  ])("is none %s", (_, account, asked) => {
    expect(partnerOf(account, asked)).toBeUndefined();
  });

  it("is another account's at its address", () => {
    expect(partnerOf(ALICE, BOB)).toBe(BOB);
  });

  const LINE: Line = {
    id: "a",
    time: "2026-10-25T10:00:00.000Z",
    from: BOB,
    account: BOB,
    text: "hi",
    kind: "message",
  };
  const ALL = { [BOB]: [LINE] };

  it("shows a partner's lines while the account hears everyone, or hears it", () => {
    expect(conversationOf(ALL, { onlyKnown: false, known: new Set() }, BOB).lines).toEqual([LINE]);
    expect(conversationOf(ALL, { onlyKnown: true, known: new Set([BOB]) }, BOB).lines).toEqual([LINE]);
  });

  it("shows none of a stranger's while the account hears those it wrote to alone, and says they are not kept", () => {
    const shown = conversationOf(ALL, { onlyKnown: true, known: new Set([CAROL]) }, BOB);
    expect(shown.lines).toEqual([]);
    expect(shown.empty).toMatch(/^Not kept: /);
  });

  it("shows nothing with no partner, and a conversation never heard as empty", () => {
    expect(conversationOf(ALL, { onlyKnown: false, known: new Set() }, undefined).lines).toEqual([]);
    expect(conversationOf(ALL, { onlyKnown: false, known: new Set() }, CAROL)).toEqual({
      lines: [],
      empty: "No messages yet.",
    });
  });
});
