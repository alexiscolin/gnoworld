import type { Line } from "@gnoworld/core";
import { describe, expect, it } from "vitest";
import type { Dms } from "./Dms.tsx";
import { roomActs } from "./roomActs.ts";
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
const acts = roomActs({ current: undefined }, "", () => undefined);
const room = (id: string): Room => ({ id, state: undefined, acts });

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

  // StrykerJS on CR10 and CR1: who is here goes beside a room by its kind; a refusal is said by why Ergo refused.
  it("says its kind, a direct message or a room", () => {
    expect(shownOf(dms(ALICE), room("#bubble"), PAGE)?.kind).toBe("dm");
    expect(shownOf(dms(), room("#bubble"), PAGE)?.kind).toBe("room");
  });

  it("says why a line to the partner did not go: offline, or refused otherwise; nothing with no refusal", () => {
    const refused = (offline: boolean): Dms => ({
      ...dms(ALICE),
      refused: offline ? { count: 1, draft: "hi" } : { count: 1, draft: "hi", offline },
    });
    expect(shownOf(dms(ALICE), room("#bubble"), PAGE)?.writer.refused).toBeUndefined();
    expect(shownOf(refused(true), room("#bubble"), PAGE)?.writer.refused?.why).toBe(
      "Not sent: g10gh7…3y5tv is not online.",
    );
    expect(shownOf(refused(false), room("#bubble"), PAGE)?.writer.refused?.why).toBe(
      "Not sent: the chat refused this line.",
    );
  });

  it("keeps a conversation's key while it stays in view", () => {
    expect(shownOf(dms(ALICE), room("#bubble"), PAGE)?.key).toBe(shownOf(dms(ALICE), room("#garden"), PAGE)?.key);
    expect(shownOf(dms(), room("#bubble"), PAGE)?.key).toBe(shownOf(dms(), room("#bubble"), PAGE)?.key);
  });
});

// 4f-n: a conversation is seen as its reader reaches its end, as a room is read: the same hook, given a way out.
describe("shownOf: a direct message seen", () => {
  const line = (id: string, time: string): Line => ({
    id,
    time,
    from: ALICE,
    account: ALICE,
    text: id,
    kind: "message",
  });
  const withLines = (partner: string): Dms => ({ ...dms(partner), lines: [line("d1", "2026-10-25T10:01:00.000Z")] });

  it("tells the page the conversation seen up to the line read's time", () => {
    const seen: [string, string][] = [];
    const page: DmPage = { ...PAGE, seen: (partner, time) => seen.push([partner, time]) };
    const shown = shownOf(withLines(ALICE), room("#bubble"), page);
    shown?.view.onRead?.("d1");
    expect(seen).toEqual([[ALICE, "2026-10-25T10:01:00.000Z"]]);
  });

  it("tells nothing of a line it does not hold", () => {
    const seen: string[] = [];
    const page: DmPage = { ...PAGE, seen: (partner) => seen.push(partner) };
    shownOf(withLines(ALICE), room("#bubble"), page)?.view.onRead?.("nope");
    expect(seen).toEqual([]);
  });

  it("holds the conversation's page as come, so its reader's reach of the end counts", () => {
    expect(shownOf(withLines(ALICE), room("#bubble"), PAGE)?.view.state?.paged).toBe(true);
  });

  it("gives a room no way out of its own here: its reads go through the link", () => {
    const seen: string[] = [];
    const page: DmPage = { ...PAGE, seen: (partner) => seen.push(partner) };
    shownOf(dms(), room("#bubble"), page)?.view.onRead?.("d1");
    expect(seen).toEqual([]);
  });
});
