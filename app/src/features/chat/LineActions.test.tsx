import type { Line } from "@gnoworld/core";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LineActions } from "./LineActions.tsx";

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
const GUEST_LINE: Line = { id: "g1", time: LINE.time, from: "guest-ab12cd", text: "hi", kind: "message" };
const draw = (over: Partial<Parameters<typeof LineActions>[0]> = {}) =>
  renderToStaticMarkup(
    <LineActions
      line={LINE}
      room="#bubble/games"
      me={BOB}
      onCopy={() => undefined}
      onDelete={() => true}
      onReact={() => true}
      onReply={() => undefined}
      {...over}
    />,
  );
// The items of the More menu, which comes last: the bar's React menu, when narrow, holds items of its own (U1). Every
// item's words, its icon's markup left out, its words empty too: an item that reads nothing is an item all the same
// (G11).
const items = (markup: string) =>
  [...markup.slice(markup.indexOf('aria-label="More actions"')).matchAll(/role="menuitem"[^>]*>(.*?)<\/button>/g)].map(
    (found) => found[1]?.replace(/<[^>]*>/g, ""),
  );
// An element's opening tag holding each of these attributes, in any order.
const tagWith = (tag: string, ...attributes: string[]) =>
  new RegExp(
    `<${tag}${attributes.map((a) => `(?=[^>]*\\s${a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`).join("")}[^>]*>`,
  );

// 4c's message menu (docs/decisions.md, 2026-10-26): the prototype's bar, its More menu; Report waits for slice 12.
describe("a line's actions", () => {
  it("are a toolbar named for what they act on, out of the list's live announcements, its More menu an icon", () => {
    const markup = draw();
    // 4c's UX review (U15, U3): the toolbar and its button named apart from the menu, "Message actions"; the button
    // a toolbar's small control.
    expect(markup).toMatch(tagWith("div", 'role="toolbar"', 'aria-label="Actions on this message"', 'aria-live="off"'));
    expect(markup).toMatch(tagWith("button", 'aria-label="More actions"', 'aria-haspopup="menu"', 'data-size="s"'));
    expect(markup).toMatch(tagWith("div", 'role="menu"', 'aria-label="Message actions"'));
    expect(markup).toContain('data-icon="more"');
    // U10: rising astride its line until its place is measured.
    expect(markup).not.toContain("data-inside");
  });

  // F989 (U1): narrow, the three quick reactions are one React menu: each item reacts, or takes the reaction back.
  it('hold a React menu of the three quick reactions, "Take back" the one the reader gave', () => {
    const markup = draw({ reactions: [{ emoji: "👍", count: 1, mine: true }] });
    const react = markup.slice(0, markup.indexOf('aria-label="More actions"'));
    expect([...react.matchAll(/role="menuitem"[^>]*>([^<]+)</g)].map((found) => found[1])).toEqual([
      "Take back 👍",
      "React with ❤️",
      "React with 😂",
    ]);
    expect(react).toMatch(tagWith("button", 'aria-label="React"', 'aria-haspopup="menu"'));
  });

  it("offer Copy text and Copy room link on another's line, no Delete and no Report", () => {
    expect(items(draw())).toEqual(["Copy text", "Copy room link", "View profile"]);
  });

  it("offer Delete on the reader's own line, by its account tag", () => {
    expect(items(draw({ me: ALICE }))).toEqual(["Copy text", "Copy room link", "View profile", "Delete"]);
  });

  // The red pass (M1): a guest has no address, and a guest's line no account tag: two missing values are no match.
  it.each([
    ["a guest, on an account's line", { me: undefined }],
    ["a guest, on a guest's line", { me: undefined, line: GUEST_LINE }],
    ["an account, on a guest's line under its own nick", { me: "guest-ab12cd", line: GUEST_LINE }],
    [
      "an account, on a line whose nick is its own and whose account tag is another's",
      { me: ALICE, line: { ...LINE, account: BOB } },
    ],
  ])("offer no Delete to %s", (_, over) => {
    expect(items(draw(over))).toEqual(["Copy text", "Copy room link", "View profile"]);
  });

  // 4c's UX review (U4): a delete gone out and not answered yet offers no second one.
  it("offer no Delete while the line's delete waits for Ergo", () => {
    expect(items(draw({ me: ALICE, deleting: true }))).toEqual(["Copy text", "Copy room link", "View profile"]);
  });

  it("ask before a delete in a dialog", () => {
    expect(draw({ me: ALICE })).toMatch(/<dialog[^>]*>/);
  });

  // 4c's UX review (U7): Delete apart, in danger's tone.
  it("mark Delete as an act of danger, apart", () => {
    const markup = draw({ me: ALICE });
    expect(markup).toMatch(tagWith("button", 'role="menuitem"', 'data-tone="danger"'));
    expect(markup).toMatch(/role="separator"[^>]*><\/div><button[^>]*data-tone="danger"/);
  });

  // 4c's UX review (U5, U6): the dialog says which line it means, its button the act.
  it.each([
    ["a short line whole", "hi", "hi"],
    ["a line of 80 characters whole", "a".repeat(80), "a".repeat(80)],
    ["a long line's first 80 characters", `${"a".repeat(79)}éz and more`, `${"a".repeat(79)}é…`],
    ["no emoji cut in two", `${"a".repeat(79)}👍🏽 and more`, `${"a".repeat(79)}👍🏽…`],
  ])("quote %s in the delete's dialog, which names the act", (_, text, quoted) => {
    const markup = draw({ me: ALICE, line: { ...LINE, text } });
    const described = /<dialog[^>]*aria-describedby="([^"]+)"/.exec(markup)?.[1] ?? "";
    expect(described).not.toBe("");
    expect(markup).toContain(`<p id="${described}"`);
    expect(new RegExp(`<p id="${described}"[^>]*>([^<]*)</p>`).exec(markup)?.[1]).toBe(quoted);
    expect(markup).toContain(">Delete message?</h2>");
    expect(markup).toMatch(/>Delete message<\/button>/);
  });
});

// 4d (docs/decisions.md, 2026-10-26): the prototype's bar leads with three quick reactions, each pressed when the
// reader gave it; "More reactions" waits for the emoji data. An account's alone: a room lets accounts alone speak.
describe("a line's actions: quick reactions", () => {
  // The bar's controls, in order, its menu's items left out: a button's name, and whether it is pressed.
  const controls = (markup: string) =>
    [...markup.matchAll(/<button(?![^>]*role="menuitem")[^>]*>/g)].map(([tag]) => {
      const name = /\saria-label="([^"]+)"/.exec(tag)?.[1] ?? "";
      const pressed = /\saria-pressed="(true|false)"/.exec(tag)?.[1];
      return pressed === undefined ? name : `${name} (${pressed})`;
    });

  it("lead with three quick reactions, More last, for an account", () => {
    const shown = controls(draw());
    expect(shown.slice(0, 3)).toEqual(["React with 👍 (false)", "React with ❤️ (false)", "React with 😂 (false)"]);
    expect(shown.at(-1)).toBe("More actions");
  });

  it("show a quick reaction the reader already gave as pressed, another's as not", () => {
    const markup = draw({
      reactions: [
        { emoji: "❤️", count: 2, mine: true },
        { emoji: "👍", count: 1, mine: false },
      ],
    });
    expect(controls(markup).slice(0, 3)).toEqual([
      "React with 👍 (false)",
      "React with ❤️ (true)",
      "React with 😂 (false)",
    ]);
  });

  it("offer a guest no reaction", () => {
    expect(controls(draw({ me: undefined }))).toEqual(["More actions"]);
  });
});

// 4d: Reply sits on the bar right before More, an account's alone.
describe("a line's actions: Reply", () => {
  const names = (markup: string) => [...markup.matchAll(/<button[^>]*\saria-label="([^"]+)"/g)].map(([, name]) => name);

  it("offer Reply right before More, with its icon, to an account", () => {
    const markup = draw();
    expect(names(markup).slice(-2)).toEqual(["Reply", "More actions"]);
    expect(markup).toContain('data-icon="reply"');
  });

  it("offer a guest no Reply", () => {
    expect(names(draw({ me: undefined }))).not.toContain("Reply");
  });
});

// 4d's threads (docs/decisions.md, 2026-10-27, R9): a line's thread opens from an item of its More menu, not a fourth
// control on the bar, whose phone width holds three on one row (F1170's U1); a page that opens no thread gives no item.
describe("a line's actions: Open thread", () => {
  const controls = (markup: string) =>
    [...markup.matchAll(/<button(?![^>]*role="menuitem")[^>]*\saria-label="([^"]+)"/g)].map((found) => found[1]);

  it("offer Open thread in the More menu, after the copies, when the page opens a thread", () => {
    expect(items(draw({ onThread: () => undefined }))).toEqual([
      "Copy text",
      "Copy room link",
      "Open thread",
      "View profile",
    ]);
  });

  it("offer Open thread to a guest too: a guest reads a thread", () => {
    expect(items(draw({ me: undefined, onThread: () => undefined }))).toEqual([
      "Copy text",
      "Copy room link",
      "Open thread",
      "View profile",
    ]);
  });

  it("offer it before Delete on the reader's own line, Delete still last and apart", () => {
    expect(items(draw({ me: ALICE, onThread: () => undefined }))).toEqual([
      "Copy text",
      "Copy room link",
      "Open thread",
      "View profile",
      "Delete",
    ]);
  });

  it("offer none where the page opens no thread", () => {
    expect(items(draw())).not.toContain("Open thread");
  });

  it("add no control to the bar: its buttons are the same with and without it", () => {
    expect(controls(draw({ onThread: () => undefined }))).toEqual(controls(draw()));
    expect(controls(draw({ me: undefined, onThread: () => undefined }))).toEqual(["More actions"]);
    expect(controls(draw({ onThread: () => undefined })).slice(-2)).toEqual(["Reply", "More actions"]);
  });
});

// 4d-dm-bar (docs/decisions.md, 2026-10-27): a direct message's More menu holds what a conversation of two has, no link
// (?dm= opens the reader's own) and no room's item (thread, pin, mark unread, save). Each item says its kinds, so one
// added for rooms later stays out of a direct message until it asks for one.
describe("a line's actions in a direct message", () => {
  const dm = (over: Partial<Parameters<typeof LineActions>[0]> = {}) =>
    draw({ room: undefined, dm: ALICE, onEdit: () => undefined, ...over });

  it("hold the direct message's items alone on another's line: Copy text", () => {
    expect(items(dm({ me: BOB }))).toEqual(["Copy text", "View profile"]);
  });

  it("hold Copy text, Edit and Delete on the reader's own line, and never a room's link", () => {
    expect(items(dm({ me: ALICE }))).toEqual(["Copy text", "View profile", "Edit", "Delete"]);
    expect(items(dm({ me: ALICE }))).not.toContain("Copy room link");
  });

  it("offer Edit on a message of one's own alone: none on an action, none while a delete waits, none unasked", () => {
    expect(items(dm({ me: ALICE, line: { ...LINE, kind: "action" } }))).toEqual([
      "Copy text",
      "View profile",
      "Delete",
    ]);
    expect(items(dm({ me: ALICE, deleting: true }))).toEqual(["Copy text", "View profile"]);
    expect(items(dm({ me: ALICE, onEdit: undefined }))).toEqual(["Copy text", "View profile", "Delete"]);
  });

  // /code-review on 4d's DM bar (CR5): an orphan correction (`edits` set, its original gone) is a message of one's own too.
  it("offer no Edit on an orphan correction, whose original left the window", () => {
    expect(items(dm({ me: ALICE, line: { ...LINE, edits: "m9" } }))).toEqual(["Copy text", "View profile", "Delete"]);
  });

  it("still lead with the quick reactions and Reply, an account's, with More last", () => {
    const markup = dm({ me: BOB });
    const names = [...markup.matchAll(/<button(?![^>]*role="menuitem")[^>]*\saria-label="([^"]+)"/g)].map(([, n]) => n);
    expect(names).toEqual(["React with 👍", "React with ❤️", "React with 😂", "React", "Reply", "More actions"]);
  });

  it("ask before a delete, saying the line leaves the conversation for both, in the partner's short address", () => {
    const markup = dm({ me: ALICE });
    expect(markup).toContain("It leaves your conversation with g10gh7…3y5tv for both of you, and cannot come back.");
    expect(markup).not.toContain("It leaves #");
  });
});

// slice-4-room-edit (docs/decisions.md, 2026-10-28, F1560): a room's own lines get Edit as a direct message's do, between
// the room's link and Delete.
describe("a line's actions in a room: Edit", () => {
  const edit = () => undefined;

  it("offer Edit on the reader's own message, between Copy room link and Delete", () => {
    expect(items(draw({ me: ALICE, onEdit: edit }))).toEqual([
      "Copy text",
      "Copy room link",
      "View profile",
      "Edit",
      "Delete",
    ]);
  });

  it("offer none unasked: a view that gives no edit has the room's items as they were", () => {
    expect(items(draw({ me: ALICE }))).toEqual(["Copy text", "Copy room link", "View profile", "Delete"]);
  });

  it("offer none on another's line, nor on a guest's, nor to a guest", () => {
    expect(items(draw({ me: BOB, onEdit: edit }))).toEqual(["Copy text", "Copy room link", "View profile"]);
    expect(items(draw({ me: undefined, onEdit: edit }))).toEqual(["Copy text", "Copy room link", "View profile"]);
    expect(items(draw({ me: undefined, line: GUEST_LINE, onEdit: edit }))).toEqual([
      "Copy text",
      "Copy room link",
      "View profile",
    ]);
  });

  it("offer none on an action, while a delete waits, nor on an orphan correction", () => {
    expect(items(draw({ me: ALICE, onEdit: edit, line: { ...LINE, kind: "action" } }))).toEqual([
      "Copy text",
      "Copy room link",
      "View profile",
      "Delete",
    ]);
    expect(items(draw({ me: ALICE, onEdit: edit, deleting: true }))).toEqual([
      "Copy text",
      "Copy room link",
      "View profile",
    ]);
    expect(items(draw({ me: ALICE, onEdit: edit, line: { ...LINE, edits: "m9" } }))).toEqual([
      "Copy text",
      "Copy room link",
      "View profile",
      "Delete",
    ]);
  });
});
