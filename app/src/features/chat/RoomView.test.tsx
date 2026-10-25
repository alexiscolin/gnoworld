import type { Line } from "@gnoworld/core";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MEMBERS_SHOWN, RoomView, type RoomViewProps } from "./RoomView.tsx";

const ALICE = "g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv";
const BOB = "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5";
const T0 = "2026-10-25T10:00:00.000Z";
const line = (over: Partial<Line> = {}): Line => ({
  id: "a",
  time: T0,
  from: ALICE,
  account: ALICE,
  text: "hello",
  kind: "message",
  ...over,
});
const GUEST_LINE: Line = { id: "g", time: T0, from: "guest-ab12cd", text: "hello", kind: "message" };
const ROOM = { lines: [line()], members: [ALICE, "guest-ab12cd"], topic: "Bubbles here" };
const view = (over: Partial<RoomViewProps> = {}) =>
  renderToStaticMarkup(<RoomView room="#bubble/games" state={ROOM} chat="connected" {...over} />);
const said = (html: string) =>
  html
    .replaceAll(/<[^>]+>/g, " ")
    .replaceAll(/\s+/g, " ")
    .trim();
// The inside of the list or aside named `label`, as React writes the name (an apostrophe escaped).
const part = (html: string, label: string) => {
  const name = label.replaceAll("'", "&#x27;");
  const found = new RegExp(`<(ol|aside)[^>]*aria-label="${name}"[^>]*>(.*?)</\\1>`, "s").exec(html);
  return found?.[2] ?? "";
};
// Each list item's words.
const items = (html: string) => [...html.matchAll(/<li[^>]*>(.*?)<\/li>/gs)].map((m) => said(m[1] ?? ""));
const paragraphs = (html: string) => (html.match(/<p[ >]/g) ?? []).length;

describe("RoomView", () => {
  it("names the room, its description right after, from its topic", () => {
    expect(view()).toMatch(/<h2[^>]*>#games<\/h2>\s*<p[^>]*>Bubbles here<\/p>/);
  });

  it("names the world's main room by the world", () => {
    expect(view({ room: "#bubble" })).toMatch(/<h2[^>]*>#bubble<\/h2>/);
  });

  it("gives no description when the room has none", () => {
    expect(paragraphs(view({ state: { ...ROOM, topic: undefined } }))).toBe(paragraphs(view()) - 1);
  });

  it("shows a line with its time of day, its author by account, shortened, and its text, and no mark", () => {
    const html = part(view(), "Messages");
    expect(html).toMatch(new RegExp(`<time dateTime="${T0}"[^>]*>\\d{2}:\\d{2}</time>`));
    expect(html).toContain(`title="${ALICE}"`);
    expect(items(html)).toEqual([expect.stringMatching(/^\d{2}:\d{2} g10gh7…3y5tv hello$/)]);
  });

  it("names a guest's line by its nick and says it is a guest's, never by an account", () => {
    const html = part(view({ state: { ...ROOM, lines: [GUEST_LINE] } }), "Messages");
    expect(items(html)).toEqual([expect.stringMatching(/^\d{2}:\d{2} guest-ab12cd \(guest\) hello$/)]);
    expect(html).not.toContain("title=");
  });

  // The account tag alone says who wrote: a nick is only a nick.
  it("names a line by its account though its nick says another", () => {
    const html = part(view({ state: { ...ROOM, lines: [line({ from: "g1victim", account: ALICE })] } }), "Messages");
    expect(said(html)).not.toContain("g1victim");
    expect(html).toContain(`title="${ALICE}"`);
  });

  it("names an account that is no address by its whole name, the moderation bot's", () => {
    const html = part(
      view({ state: { ...ROOM, lines: [line({ from: "gnoworld", account: "gnoworld" })] } }),
      "Messages",
    );
    expect(items(html)).toEqual([expect.stringMatching(/^\d{2}:\d{2} gnoworld hello$/)]);
  });

  it("shows an /me as its author doing it", () => {
    const html = part(view({ state: { ...ROOM, lines: [line({ kind: "action", text: "waves" })] } }), "Messages");
    expect(items(html)).toEqual([expect.stringMatching(/^\d{2}:\d{2} \* g10gh7…3y5tv waves$/)]);
  });

  it("marks a notice as one", () => {
    const html = part(view({ state: { ...ROOM, lines: [line({ kind: "notice", text: "heads up" })] } }), "Messages");
    const [notice = ""] = items(html);
    expect(notice).toContain("Notice");
    expect(notice).toContain("heads up");
    expect(notice).not.toContain("*");
    // Muted, its mark apart: the classes the sheet reads (`.notice .text`, `.mark`).
    expect(html).toMatch(
      /<li class="[^"]*notice[^"]*">.*<span class="[^"]*mark[^"]*">Notice <\/span><span class="[^"]*text[^"]*">heads up<\/span>/s,
    );
  });

  it("shows a line, a topic, a nick, a member and an account as text, never as markup or a link", () => {
    const hostile = "<img src=x onerror=alert(1)>";
    const lines = [
      line({ text: "<script>alert(1)</script> javascript:alert(1)" }),
      { ...GUEST_LINE, id: "b", from: hostile },
      line({ id: "c", account: `"><img src=x onerror=alert(1)>` }),
    ];
    const html = view({ state: { lines, members: [hostile], topic: "<b>bold</b>" } });
    expect(html).not.toMatch(/<script|<img|<b>|<a |href=/);
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(html).toContain("&lt;b&gt;bold&lt;/b&gt;");
  });

  // The lines scroll in a box of their own, which holds nothing focusable: the keyboard reaches it itself (axe's
  // scrollable-region-focusable).
  it("lets the keyboard reach the lines, to scroll them", () => {
    expect(view()).toMatch(
      /<ol [^>]*aria-label="Messages"[^>]*tabindex="0"|<ol [^>]*tabindex="0"[^>]*aria-label="Messages"/i,
    );
  });

  // 4b's pre-merge (/code-review): lines that come while the room is open reach a screen reader.
  it("announces the lines that come, politely, and them alone", () => {
    const html = view();
    expect(html).toMatch(/<ol [^>]*aria-live="polite"/);
    expect(html).toMatch(/<ol [^>]*aria-relevant="additions"/);
  });

  it("shows the lines in the order the store holds them, oldest first", () => {
    const lines = [line({ id: "a", text: "first" }), line({ id: "b", text: "second" })];
    expect(said(part(view({ state: { ...ROOM, lines } }), "Messages"))).toMatch(/first.*second/);
  });

  it("says a room with no line has no message yet, once connected", () => {
    expect(said(view({ state: { ...ROOM, lines: [] } }))).toContain("No messages yet.");
  });

  it("says who is here: how many, accounts shortened, guests named as guests", () => {
    const html = part(view(), "Who's here");
    expect(said(html)).toContain("2 here");
    expect(html).toContain(`title="${ALICE}"`);
    expect(items(html)).toEqual(["g10gh7…3y5tv", "guest-ab12cd (guest)"]);
  });

  // Only an account has an address for a nick: Ergo gives a guest 32 characters (server/src/testing/ergo.test.ts:314).
  it.each([
    ["g1guest", "g1guest (guest)"],
    [`guest-${"a".repeat(26)}`, `guest-${"a".repeat(26)} (guest)`],
    [ALICE.slice(0, 39), `${ALICE.slice(0, 39)} (guest)`],
    [`${ALICE.slice(0, 39)}q`, `${ALICE.slice(0, 39)}q (guest)`],
    [BOB, "g1jg8m…vsqf5"],
  ])("names a member %s as %s: an address only when it is one", (nick, shown) => {
    expect(items(part(view({ state: { ...ROOM, members: [nick] } }), "Who's here"))).toEqual([shown]);
  });

  it("leaves the moderation bot out of who is here, and out of the count", () => {
    const html = part(view({ state: { ...ROOM, members: ["gnoworld", ALICE] } }), "Who's here");
    expect(said(html)).toContain("1 here");
    expect(items(html)).toEqual(["g10gh7…3y5tv"]);
  });

  it(`lists ${String(MEMBERS_SHOWN)} people at most, and says how many more are here`, () => {
    expect(MEMBERS_SHOWN).toBe(100);
    const members = Array.from({ length: 2000 }, (_, n) => `guest-${String(n).padStart(6, "0")}`);
    const html = part(view({ state: { ...ROOM, members } }), "Who's here");
    expect(said(html)).toContain("2000 here");
    expect(items(html).filter((each) => each.endsWith("(guest)"))).toHaveLength(100);
    expect(said(html)).toContain("and 1900 more");
  });

  it.each([
    [2, ""],
    [100, ""],
    [101, "and 1 more"],
  ])("names %i people, and says how many more only past the hundredth", (count, more) => {
    const members = Array.from({ length: count }, (_, n) => `guest-${String(n).padStart(6, "0")}`);
    const html = part(view({ state: { ...ROOM, members } }), "Who's here");
    expect(/and \d+ more/.exec(said(html))?.[0] ?? "").toBe(more);
  });

  it("says no empty room when it holds lines", () => {
    expect(said(view())).not.toContain("No messages yet.");
  });

  it("names who is here as such while it is not connected", () => {
    expect(view({ chat: "waiting" })).toMatch(/<h3[^>]*>Who&#x27;s here<\/h3>/);
  });

  // The words a reader gets, the markup taken off with nothing in its place.
  it("puts a space between a line's time, author and text", () => {
    const [item = ""] = [...part(view(), "Messages").matchAll(/<li[^>]*>(.*?)<\/li>/gs)].map((m) => m[1] ?? "");
    expect(item.replaceAll(/<[^>]+>/g, "")).toMatch(/^\d{2}:\d{2} g10gh7…3y5tv hello$/);
  });

  it.each([
    ["connecting", "Connecting to the chat…"],
    ["waiting", "The chat is out of reach. Trying again…"],
    ["off", "Connecting to the chat…"],
    ["stopped", "The chat is off."],
    ["logged-out", "Connecting to the chat…"],
  ] as const)("says the link is %s, keeps the lines it holds, and claims no one here", (chat, words) => {
    const html = view({ chat, state: { ...ROOM, members: [] } });
    expect(html).toMatch(new RegExp(`role="status"[^>]*>${words}<`));
    expect(said(part(html, "Messages"))).toContain("hello");
    expect(said(part(html, "Who's here"))).not.toMatch(/\d+ here/);
  });

  it("says nothing of the link once connected, its status region there, empty", () => {
    expect(view()).toMatch(/role="status"[^>]*><\/p>/);
  });

  it("claims no empty room while it is not connected", () => {
    const html = view({ chat: "waiting", state: { lines: [], members: [], topic: undefined } });
    expect(said(html)).not.toContain("No messages yet.");
  });

  it("reads a line's Markdown into elements, and keeps a hostile line as its text", () => {
    const lines = [
      line({ text: "a **b** [x](https://a.example)" }),
      line({ id: "h", text: "<script>alert(1)</script> [y](javascript:alert(1))" }),
    ];
    const html = view({ state: { ...ROOM, lines } });
    expect(html).toContain("<strong>b</strong>");
    expect(html).toContain(
      '<a href="https://a.example" title="https://a.example" target="_blank" rel="noopener noreferrer">x</a>',
    );
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt; [y](javascript:alert(1))");
    expect(html).not.toMatch(/<script|href="javascript/);
  });

  it("shows what it is given under the lines, before who is here: the composer, or a word for a guest", () => {
    const html = view({ composer: <p>Log in to write in this room.</p> });
    expect(html).toMatch(/aria-label="Messages".*<\/ol><p>Log in to write in this room.<\/p><\/div><aside/s);
  });

  it("shows a room it holds nothing of yet as empty, once connected", () => {
    const html = view({ state: undefined });
    expect(said(html)).toContain("No messages yet.");
    expect(said(part(html, "Who's here"))).toContain("0 here");
  });
});
