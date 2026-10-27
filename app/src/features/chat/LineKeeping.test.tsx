import type { Line } from "@gnoworld/core";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LineActions, type LineActionsProps } from "./LineActions.tsx";
import { lineKeeping } from "./LineKeeping.tsx";
import type { RoomKeeping } from "./RoomKeeping.ts";

// 4d's part of a line's bar (docs/decisions.md, 2026-10-26: the bar holds Pin beside Reply and Thread; ⋯ holds Save,
// Mark unread, Copy and, on one's own line, Edit and Delete). Apart from LineActions.test.tsx, which is 4c's: the
// items a reader gets by what it is, an account or a guest, and by the right it holds, a moderator's to pin.
const ALICE = "g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv";
const BOB = "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5";
const LINE: Line = {
  id: "AB12",
  time: "2026-10-25T10:00:00.000Z",
  from: ALICE,
  account: ALICE,
  text: "hi",
  kind: "message",
};
const none = () => undefined;
const keeping = (
  over: Partial<NonNullable<LineActionsProps["keeping"]>> = {},
): NonNullable<LineActionsProps["keeping"]> => ({
  saved: false,
  onSave: none,
  onUnsave: none,
  onMarkUnread: none,
  ...over,
});
const BASE: LineActionsProps = { line: LINE, room: "#bubble/games", me: BOB, onCopy: none, onDelete: () => true };
const draw = (over: Partial<LineActionsProps> = {}) => renderToStaticMarkup(<LineActions {...BASE} {...over} />);
// The words of each menu item, its icon's markup left out.
const items = (markup: string) =>
  Array.from(markup.matchAll(/role="menuitem"[^>]*>(.*?)<\/button>/g), ([, inner = ""]) =>
    inner.replace(/<[^>]*>/g, ""),
  );
// Another merge's items (Edit, Reply...) may join the menu: 4d's own are read in their order, after the copies and before a
// delete, never as the whole list (4d's R17).
const own = (markup: string) =>
  items(markup).filter((item) => ["Save message", "Remove from saved", "Mark unread"].includes(item));
// The toolbar's own buttons, apart from the menu's: each opening tag's aria-label.
const barButtons = (markup: string) =>
  [...markup.matchAll(/<button(?![^>]*role="menuitem")[^>]*aria-label="([^"]*)"/g)].map((found) => found[1]);

describe("a line's actions for an account", () => {
  it("add Save message and Mark unread to Copy, on another's line, after the copies", () => {
    const menu = items(draw({ keeping: keeping() }));
    expect(own(draw({ keeping: keeping() }))).toEqual(["Save message", "Mark unread"]);
    expect(menu.indexOf("Save message")).toBeGreaterThan(menu.indexOf("Copy room link"));
    expect(menu.indexOf("Mark unread")).toBeGreaterThan(menu.indexOf("Save message"));
  });

  it("offer Remove from saved, not Save message, on a line already saved", () => {
    expect(own(draw({ keeping: keeping({ saved: true }) }))).toEqual(["Remove from saved", "Mark unread"]);
  });

  // A line one wrote is read by definition: marking it unread would mark the next of another's, which no one meant.
  it("offer no Mark unread on the reader's own line, Delete staying last and apart", () => {
    const markup = draw({ me: ALICE, keeping: keeping() });
    expect(own(markup)).toEqual(["Save message"]);
    expect(items(markup).at(-1)).toBe("Delete");
    expect(markup).toMatch(/role="separator"[^>]*><\/div><button[^>]*data-tone="danger"/);
  });

  it("offer only Copy to a guest, who has no device to save on or mark by: it is given no keeping", () => {
    expect(own(draw({ me: undefined }))).toEqual([]);
  });
});

describe("a line's Pin", () => {
  const pin = (pinned: boolean) => ({ pinned, onPin: none, onUnpin: none });

  it("is a button of the bar, before More, for a reader who may pin, and no item of the menu", () => {
    const markup = draw({ keeping: keeping({ pin: pin(false) }) });
    expect(barButtons(markup)).toEqual(["Pin message", "More actions"]);
    expect(items(markup)).not.toContain("Pin message");
    expect(markup).toContain('data-icon="pin"');
  });

  it("says Unpin message on a line already pinned", () => {
    expect(barButtons(draw({ keeping: keeping({ pin: pin(true) }) }))).toEqual(["Unpin message", "More actions"]);
  });

  it("is not offered to a reader who may not pin, an account that moderates nothing among them", () => {
    expect(barButtons(draw({ keeping: keeping() }))).toEqual(["More actions"]);
    expect(barButtons(draw())).toEqual(["More actions"]);
  });

  it("is a button that submits nothing, named for what it does now", () => {
    const markup = draw({ keeping: keeping({ pin: pin(true) }) });
    expect(markup).toMatch(/<button(?=[^>]*type="button")(?=[^>]*aria-label="Unpin message")[^>]*>/);
  });
});

// What the server and the device take: a plain message of an account is pinned; a plain message is saved; any line may be
// marked unread (4d's R9, R12).
describe("what a line of another kind is offered", () => {
  const pin = { pinned: false, onPin: none, onUnpin: none };
  const guest: Line = { id: "G1", time: LINE.time, from: "guest-ab12cd", text: "hi", kind: "message" };

  it.each([
    ["an /me", { ...LINE, kind: "action" as const }],
    ["a notice", { ...LINE, kind: "notice" as const }],
  ])("offers %s Mark unread alone: no Save, no Pin", (_, line) => {
    const markup = draw({ line, keeping: keeping({ pin }) });
    expect(own(markup)).toEqual(["Mark unread"]);
    expect(barButtons(markup)).toEqual(["More actions"]);
  });

  it("offers a guest's line no Pin, the server pinning a line of an account's alone, but Save and Mark unread", () => {
    const markup = draw({ line: guest, keeping: keeping({ pin }) });
    expect(barButtons(markup)).toEqual(["More actions"]);
    expect(own(markup)).toEqual(["Save message", "Mark unread"]);
  });
});

// The acts a line's bar calls, each saying in the room's flash why it did not happen (4d's R9).
describe("a line's keeping, bound to the room's", () => {
  const room = (over: Partial<RoomKeeping> = {}): RoomKeeping => ({
    unread: undefined,
    saved: new Set(["AB12"]),
    pinned: new Set(["AB12"]),
    onSave: () => "saved",
    onUnsave: none,
    onMarkUnread: none,
    onReadThrough: none,
    ...over,
  });
  const said = () => {
    const flashes: { title: string; line?: string }[] = [];
    return { flashes, say: (message: { title: string; line?: string }) => void flashes.push(message) };
  };
  const settled = () => new Promise((resolve) => setTimeout(resolve, 0));

  it("gives a guest, and a room with no keeping, none", () => {
    expect(lineKeeping(room(), undefined, none)(LINE)).toBeUndefined();
    expect(lineKeeping(undefined, BOB, none)(LINE)).toBeUndefined();
  });

  it("says whether the line is saved, and acts by the line's id", () => {
    const acts: string[] = [];
    const kept = lineKeeping(
      room({
        onUnsave: (id) => void acts.push(`unsave ${id}`),
        onMarkUnread: (id) => void acts.push(`unread ${id}`),
      }),
      BOB,
      none,
    )(LINE);
    expect(kept?.saved).toBe(true);
    kept?.onUnsave();
    kept?.onMarkUnread();
    expect(acts).toEqual(["unsave AB12", "unread AB12"]);
  });

  it("says a message saved on this device alone, or why the device did not keep it", () => {
    const { flashes, say } = said();
    lineKeeping(room(), BOB, say)(LINE)?.onSave();
    lineKeeping(room({ onSave: () => "full" }), BOB, say)(LINE)?.onSave();
    lineKeeping(room({ onSave: () => "none" }), BOB, say)(LINE)?.onSave();
    expect(flashes).toEqual([
      { title: "Message saved.", line: "Kept on this device only." },
      { title: "Could not save the message.", line: "You have 200 saved messages. Remove one first." },
      { title: "Could not save the message.", line: "This message cannot be saved." },
    ]);
  });

  it("offers Pin only where the reader may pin, and says nothing of one the server took", async () => {
    const { flashes, say } = said();
    expect(lineKeeping(room(), BOB, say)(LINE)?.pin).toBeUndefined();
    const asked: string[] = [];
    const pin = {
      pin: (id: string) => {
        asked.push(`pin ${id}`);
        return Promise.resolve({ ok: true as const });
      },
      unpin: (id: string) => {
        asked.push(`unpin ${id}`);
        return Promise.resolve({ ok: false as const, reason: "not_found" as const });
      },
    };
    const kept = lineKeeping(room({ pin }), BOB, say)(LINE)?.pin;
    expect(kept?.pinned).toBe(true);
    kept?.onPin();
    kept?.onUnpin();
    await settled();
    expect(asked).toEqual(["pin AB12", "unpin AB12"]);
    expect(flashes).toEqual([{ title: "Could not unpin the message.", line: "It is not pinned any more." }]);
  });

  it("says the chat could not be reached when the call itself fails", async () => {
    const { flashes, say } = said();
    const pin = { pin: () => Promise.reject(new Error("broken")), unpin: () => Promise.reject(new Error("broken")) };
    lineKeeping(room({ pin }), BOB, say)(LINE)?.pin?.onPin();
    await settled();
    expect(flashes).toEqual([
      { title: "Could not pin the message.", line: "The chat server could not be reached. Try again in a moment." },
    ]);
  });
});
