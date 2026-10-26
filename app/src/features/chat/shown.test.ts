import { describe, expect, it } from "vitest";
import type { Dms } from "./Dms.tsx";
import { shownOf, type DmPage, type Room } from "./shown.tsx";

const ALICE = "g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv";
const BOB = "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5";
const PAGE: DmPage = { sayTo: () => true, focus: false, noteId: "note" };
const dms = (partner?: string): Dms => ({
  partner,
  nav: undefined,
  lines: [],
  empty: "",
  refused: undefined,
  problem: undefined,
});
const room = (id: string): Room => ({ id, state: undefined, say: () => true });

// /code-review (CR10): the view's key was "room" or "dm", so going from one conversation to another of the same kind
// kept the last one's view, its scroll and whether its reader was at the end with it.
describe("shownOf: the conversation in view", () => {
  it("keys each conversation apart: two direct messages, two rooms, and a room from a direct message", () => {
    const keys = [
      shownOf(dms(ALICE), room("#bubble"), PAGE)?.key,
      shownOf(dms(BOB), room("#bubble"), PAGE)?.key,
      shownOf(dms(), room("#bubble"), PAGE)?.key,
      shownOf(dms(), room("#bubble/games"), PAGE)?.key,
    ];
    expect(keys.every((key) => key !== undefined)).toBe(true);
    expect(new Set(keys).size).toBe(4);
  });

  it("keeps a conversation's key while it stays in view", () => {
    expect(shownOf(dms(ALICE), room("#bubble"), PAGE)?.key).toBe(shownOf(dms(ALICE), room("#garden"), PAGE)?.key);
    expect(shownOf(dms(), room("#bubble"), PAGE)?.key).toBe(shownOf(dms(), room("#bubble"), PAGE)?.key);
  });
});
