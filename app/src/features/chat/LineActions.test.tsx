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
    <LineActions line={LINE} room="#bubble/games" me={BOB} onCopy={() => undefined} onDelete={() => true} {...over} />,
  );
// Every item, its words empty too: an item that reads nothing is an item all the same (G11).
const items = (markup: string) => [...markup.matchAll(/role="menuitem"[^>]*>([^<]*)</g)].map((found) => found[1]);
// An element's opening tag holding each of these attributes, in any order.
const tagWith = (tag: string, ...attributes: string[]) =>
  new RegExp(
    `<${tag}${attributes.map((a) => `(?=[^>]*\\s${a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`).join("")}[^>]*>`,
  );

// 4c's message menu (docs/decisions.md, 2026-10-26): the prototype's bar, its More menu; Report waits for slice 12.
describe("a line's actions", () => {
  it("are a toolbar named for what they act on, out of the list's live announcements, its More menu an icon", () => {
    const markup = draw();
    expect(markup).toMatch(tagWith("div", 'role="toolbar"', 'aria-label="Message actions"', 'aria-live="off"'));
    expect(markup).toMatch(tagWith("button", 'aria-label="More"', 'aria-haspopup="menu"'));
    expect(markup).toContain('data-icon="more"');
  });

  it("offer Copy text and Copy room link on another's line, no Delete and no Report", () => {
    expect(items(draw())).toEqual(["Copy text", "Copy room link"]);
  });

  it("offer Delete on the reader's own line, by its account tag", () => {
    expect(items(draw({ me: ALICE }))).toEqual(["Copy text", "Copy room link", "Delete"]);
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
    expect(items(draw(over))).toEqual(["Copy text", "Copy room link"]);
  });

  it("ask before a delete in a dialog", () => {
    expect(draw({ me: ALICE })).toMatch(/<dialog[^>]*>/);
  });
});
