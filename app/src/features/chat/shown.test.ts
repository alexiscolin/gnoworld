import { describe, expect, it } from "vitest";
import type { Dms } from "./Dms.tsx";
import type { ChatLink } from "./link.ts";
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

// 4d-dm-bar: a direct message's view carries the bar's acts, through the page's own, to its partner.
describe("shownOf: a direct message's bar", () => {
  const reaction = { id: "r1", time: "2026-10-25T10:00:00.000Z", to: "m1", emoji: "👍", who: BOB, on: true };
  const calls: string[] = [];
  const bar: DmPage = {
    ...PAGE,
    acts: {
      onDelete: (id) => {
        calls.push(`delete ${id}`);
        return true;
      },
      onDismiss: () => {
        calls.push("dismiss");
      },
      onReact: ({ to, emoji, on }) => {
        calls.push(`react ${to} ${emoji} ${String(on)}`);
        return true;
      },
    },
  };
  const withBar = (): Dms => ({
    ...dms(ALICE),
    reactions: [reaction],
    acts: { deleted: "m9", reacted: true },
  });

  it("names its partner, so its lines have a bar, and a room's view names none", () => {
    expect(shownOf(withBar(), room("#bubble"), bar)?.view.partner).toBe(ALICE);
    expect(shownOf(dms(), room("#bubble"), bar)?.view.partner).toBeUndefined();
    expect(shownOf(withBar(), room("#bubble"), bar)?.view.room).toBeUndefined();
  });

  it("gives the lines' view the conversation's reactions and what Ergo refused of its acts", () => {
    const state = shownOf(withBar(), room("#bubble"), bar)?.view.state;
    expect(state?.reactions).toEqual([reaction]);
    expect(state?.refused).toBe("m9");
    expect(state?.cannotReact).toBe(true);
    const plain = shownOf(dms(ALICE), room("#bubble"), bar)?.view.state;
    expect([plain?.reactions, plain?.refused, plain?.cannotReact]).toEqual([undefined, undefined, undefined]);
  });

  it("deletes, dismisses and reacts through the page's acts, in this conversation", () => {
    const view = shownOf(withBar(), room("#bubble"), bar)?.view;
    expect(view?.onDelete("m1")).toBe(true);
    view?.onDismiss();
    expect(view?.onReact?.({ to: "m1", emoji: "👍", on: false })).toBe(true);
    expect(calls).toEqual(["delete m1", "dismiss", "react m1 👍 false"]);
  });

  it("does nothing, and says it went nowhere, while the page gives no acts", () => {
    const view = shownOf(dms(ALICE), room("#bubble"), PAGE)?.view;
    expect(view?.onDelete("m1")).toBe(false);
    expect(view?.onReact?.({ to: "m1", emoji: "👍", on: true })).toBe(false);
  });

  it("says a line through the page's sayTo, with the reply or the edit it carries", () => {
    const said: unknown[] = [];
    const page: DmPage = {
      ...PAGE,
      sayTo: (partner, draft, tags) => {
        said.push([partner, draft, tags]);
        return true;
      },
    };
    const shown = shownOf(dms(ALICE), room("#bubble"), page);
    expect(shown?.writer.onSay("plain")).toBe(true);
    expect(shown?.say("an answer", { reply: "m1" })).toBe(true);
    expect(shown?.say("a correction", { edit: "m1" })).toBe(true);
    expect(said).toEqual([
      [ALICE, "plain", undefined],
      [ALICE, "an answer", { reply: "m1" }],
      [ALICE, "a correction", { edit: "m1" }],
    ]);
  });
});

// slice-4-room-edit: a room's lines are corrected through the link, as its answers are: one say, its tags told.
describe("shownOf: a room's edits", () => {
  it("says a line through the link, a reply or a correction as each is", () => {
    const said: unknown[] = [];
    const link = {
      say: (...args: unknown[]) => said.push(["say", ...args]) > 0,
      correct: (...args: unknown[]) => said.push(["correct", ...args]) > 0,
    } as unknown as ChatLink;
    const acts = roomActs({ current: link }, "#bubble/games", () => undefined);
    const shown = shownOf(dms(), { id: "#bubble/games", state: undefined, acts }, PAGE);
    expect(shown?.writer.onSay("plain")).toBe(true);
    expect(shown?.say("an answer", { reply: "m1" })).toBe(true);
    expect(shown?.say("a correction", { edit: "m1" })).toBe(true);
    expect(said).toEqual([
      ["say", "#bubble/games", "plain", undefined],
      ["say", "#bubble/games", "an answer", "m1"],
      ["correct", "#bubble/games", "a correction", "m1"],
    ]);
  });

  it("says a correction went nowhere while the page gives no link", () => {
    const shown = shownOf(dms(), room("#bubble/games"), PAGE);
    expect(shown?.say("a correction", { edit: "m1" })).toBe(false);
  });
});
