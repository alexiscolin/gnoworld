import { describe, expect, it } from "vitest";
import type { Line } from "@gnoworld/core";
import { Address } from "@gnoworld/schemas";
import { conversationOf, listOf, partnerOf, problemOf } from "./Dms.tsx";

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

  it("shows a partner's lines, whether or not the account wrote to it", () => {
    expect(conversationOf(ALL, BOB).lines).toEqual([LINE]);
  });

  // Decision C (U2): Ergo keeps no direct message, so "No messages yet." was false after a reload.
  it("shows nothing with no partner, and a conversation never heard as empty since the page opened", () => {
    expect(conversationOf(ALL, undefined).lines).toEqual([]);
    expect(conversationOf(ALL, CAROL)).toEqual({
      lines: [],
      empty: "No messages since this page opened.",
    });
  });
});

// 4e's UX review (U9): ?dm= as a guest, at one's own address or at one that is none showed the main room, silently.
describe("what a page says of a ?dm= it cannot show", () => {
  const ME = { kind: "in", address: Address.parse(ALICE) } as const;
  it.each([
    { name: "nothing when none is asked", session: ME, asked: null, said: undefined },
    {
      name: "nothing while the session is unknown",
      session: { kind: "unknown" } as const,
      asked: BOB,
      said: undefined,
    },
    // StrykerJS on 4e: the unknown session's rule, apart from the address's.
    {
      name: "nothing of an address that is none while the session is unknown",
      session: { kind: "unknown" } as const,
      asked: "g1nope",
      said: undefined,
    },
    { name: "nothing at another account's address", session: ME, asked: BOB, said: undefined },
    {
      name: "that a guest logs in first",
      session: { kind: "out" } as const,
      asked: BOB,
      said: "Log in to read direct messages.",
    },
    { name: "that it is one's own", session: ME, asked: ALICE, said: "That is your own address." },
    { name: "that it is none", session: ME, asked: "g1nope", said: "That is not an account's address." },
  ])("says $name", ({ session, asked, said }) => {
    expect(problemOf(session, asked)).toBe(said);
  });
});
