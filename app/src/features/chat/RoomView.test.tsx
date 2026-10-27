import type { Line } from "@gnoworld/core";
import { renderToStaticMarkup } from "react-dom/server";
import { prerender } from "react-dom/static";
import { beforeAll, describe, expect, it } from "vitest";
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
// Each list item's words: a line that is a list holds items of its own, so a test of one counts the Messages
// list's own children instead (F814's class).
const items = (html: string) => [...html.matchAll(/<li[^>]*>(.*?)<\/li>/gs)].map((m) => said(m[1] ?? ""));
const paragraphs = (html: string) => (html.match(/<p[ >]/g) ?? []).length;

// The lines view loads lazily, after the page is drawn (docs/decisions.md, 2026-10-26): drawn once and waited for, it
// is held, and every view below draws it at once, as a room switch does once the page has it.
beforeAll(async () => {
  await prerender(<RoomView room="#bubble/games" state={ROOM} chat="connected" />);
});

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
    // Its mark first, before the time: where no sender's words stand (F808).
    expect(notice).toMatch(/^Notice \d{2}:\d{2} g10gh7…3y5tv heads up$/);
    // Muted, its mark apart: the classes the sheet reads (`.notice .text`, `.mark`).
    expect(html).toMatch(
      /<li class="[^"]*notice[^"]*"(?: tabindex="-?\d")?>.*<span class="[^"]*mark[^"]*">Notice <\/span>.*<span class="[^"]*text[^"]*">heads up<\/span>/s,
    );
  });

  // 4d: a line that mentions the reader, by a word as well as its colour (docs/DESIGN-SYSTEM.md, "about me").
  it("marks a line that mentions the reader, by a word and an attribute, and its mention apart", () => {
    const lines = [line({ text: `ready, @${BOB}?` }), line({ id: "b", text: `and @${ALICE}` })];
    const html = part(view({ me: BOB, state: { ...ROOM, lines } }), "Messages");
    const [first = "", second = ""] = items(html);
    expect(first).toContain("Mentions you");
    expect(first).toMatch(/g10gh7…3y5tv .*ready, @g1jg8m…vsqf5 \?$/);
    expect(second).toMatch(/^\d{2}:\d{2} g10gh7…3y5tv and @g10gh7…3y5tv$/);
    expect(html).toMatch(
      /<li data-about-me=""(?: tabindex="-?\d")?>.*<span class="[^"]*mentionsYou[^"]*">Mentions you <\/span>/s,
    );
    // The mark comes first, before the time: where no sender's words stand (F808).
    expect(first).toMatch(/^Mentions you \d{2}:\d{2} g10gh7…3y5tv ready, @g1jg8m…vsqf5 \?$/);
    expect(html).toMatch(
      /<li data-about-me=""(?: tabindex="-?\d")?><span class="[^"]*mentionsYou[^"]*">Mentions you <\/span><time /,
    );
    expect(html).toContain(`<span data-mention="me" title="${BOB}">`);
    expect(html.match(/data-about-me/g)).toHaveLength(1);
    // The line that does not mention the reader carries nothing: no class, no attribute.
    expect(html.match(/<li(?: tabindex="-?\d")?>/g)).toHaveLength(1);
  });

  it("marks a notice and an /me that mention the reader, their own marks kept", () => {
    const lines = [
      line({ kind: "notice", text: `@${BOB} heads up` }),
      line({ id: "b", kind: "action", text: `waves at @${BOB}` }),
    ];
    const html = part(view({ me: BOB, state: { ...ROOM, lines } }), "Messages");
    for (const item of items(html)) expect(item).toContain("Mentions you");
    const [notice = "", action = ""] = items(html);
    expect(notice).toContain("Notice");
    expect(notice).toMatch(/@g1jg8m…vsqf5 heads up$/);
    expect(action).toMatch(/\* g10gh7…3y5tv .*waves at @g1jg8m…vsqf5$/);
    expect(notice).toMatch(/^Mentions you Notice \d{2}:\d{2} g10gh7…3y5tv @g1jg8m…vsqf5 heads up$/);
    expect(action).toMatch(/^Mentions you \d{2}:\d{2} \* g10gh7…3y5tv waves at @g1jg8m…vsqf5$/);
    // Each keeps its kind's one class, whole, and says it is about the reader by its attribute.
    expect(html).toMatch(/<li class="[^" ]*notice[^" ]*" data-about-me=""(?: tabindex="-?\d")?>/);
    expect(html).toMatch(/<li class="[^" ]*action[^" ]*" data-about-me=""(?: tabindex="-?\d")?>/);
  });

  // Wherever the line names the reader: in a quote, a list, a mark, a second paragraph; by its own author too.
  it.each([
    [`> @${BOB}`, "in a quote"],
    [`- @${BOB}`, "in a list"],
    [`**@${BOB}**`, "in a mark"],
    [`first\n\nthen @${BOB}`, "in a second paragraph"],
    [`@${BOB} @${BOB}`, "twice"],
  ])("marks a line that mentions the reader %j once: %s", (text) => {
    const html = part(view({ me: BOB, state: { ...ROOM, lines: [line({ text })] } }), "Messages");
    expect(said(html).match(/Mentions you/g)).toHaveLength(1);
    expect(html.match(/data-about-me/g)).toHaveLength(1);
  });

  // F812: a checksum-valid address ground to shorten as BOB's does; it holds no key, so it is in no room.
  it("shows a mention of a member or of the reader shortened, of anyone else whole (F812)", () => {
    const ground = "g1jg8m2vtwlmmyz8swgu76ug4tklwnays8yvsqf5";
    const lines = [line({ text: `@${ground} @${ALICE} @${BOB}` })];
    const html = part(view({ me: BOB, state: { ...ROOM, lines } }), "Messages");
    expect(said(html)).toMatch(new RegExp(`g10gh7…3y5tv @${ground} @g10gh7…3y5tv @g1jg8m…vsqf5$`));
    expect(html).toContain(`<span data-mention="" title="${ground}">@${ground}</span>`);
  });

  // F818's StrykerJS: a line's members travel as one string; each of two keeps its short form.
  it("shortens each member a line mentions, two of them in one line", () => {
    const carol = "g1l6m6l6carqlqqqqqqqqqqqqqqqqqqqqqnkkanc";
    const lines = [line({ text: `@${ALICE} and @${carol}` })];
    const html = part(view({ state: { ...ROOM, members: [ALICE, carol], lines } }), "Messages");
    expect(said(html)).toMatch(/ @g10gh7…3y5tv and @g1l6m6…kkanc$/);
  });

  // F819 (docs/decisions.md, 2026-10-26): an author of a line in view proved its key as a member did, by Ergo's
  // account tag; a nick alone proves nothing.
  it("shortens a mention of an author of a line in view, by its account tag, though it left the room", () => {
    const carol = "g1l6m6l6carqlqqqqqqqqqqqqqqqqqqqqqnkkanc";
    const lines = [
      line({ id: "a", from: carol, account: carol, text: "bye all" }),
      line({ id: "b", text: `@${carol} left` }),
      line({ id: "c", from: BOB, text: `@${BOB} has no tag` }),
    ];
    const html = part(view({ state: { ...ROOM, members: [ALICE], lines } }), "Messages");
    const [, second = "", third = ""] = items(html);
    expect(second).toMatch(/ @g1l6m6…kkanc left$/);
    expect(third).toContain(`@${BOB} has no tag`);
  });

  it("marks no line for a lookalike of the reader's address, shown whole", () => {
    const lookalike = `g1jg8m${"q".repeat(29)}vsqf5`;
    const html = part(view({ me: BOB, state: { ...ROOM, lines: [line({ text: `hey @${lookalike}` })] } }), "Messages");
    expect(said(html)).not.toContain("Mentions you");
    expect(said(html)).toContain(`hey @${lookalike}`);
    expect(html).not.toContain("data-mention");
  });

  it('tells a sender\'s own words "Mentions you" from the mark: they come after the author, the mark before the time', () => {
    const html = part(view({ me: BOB, state: { ...ROOM, lines: [line({ text: "Mentions you, look" })] } }), "Messages");
    expect(items(html)).toEqual([expect.stringMatching(/^\d{2}:\d{2} g10gh7…3y5tv Mentions you, look$/)]);
    expect(html).not.toContain("data-about-me");
  });

  it("marks a line its own author wrote that mentions them", () => {
    const html = part(
      view({ me: ALICE, state: { ...ROOM, lines: [line({ text: `note to @${ALICE}` })] } }),
      "Messages",
    );
    expect(said(html)).toContain("Mentions you");
  });

  it.each([
    [`[@${BOB}](https://a.example)`, "in a link's label"],
    [`\\@${BOB}`, "escaped"],
    ["```\n@" + BOB + "\n```", "in a code block"],
    [`@${BOB.slice(0, -1)}q`, "one character off"],
  ])("marks no line where %j names the reader: %s", (text) => {
    const html = part(view({ me: BOB, state: { ...ROOM, lines: [line({ text })] } }), "Messages");
    expect(said(html)).not.toContain("Mentions you");
    expect(html).not.toContain("data-about-me");
  });

  it("marks no line for a guest, nor one that mentions another account, nor one whose mention is code", () => {
    const lines = [line({ text: `hi @${BOB}` }), line({ id: "b", text: `\`@${ALICE}\`` })];
    for (const me of [undefined, ALICE]) {
      const html = part(view({ me, state: { ...ROOM, lines } }), "Messages");
      expect(said(html)).not.toContain("Mentions you");
      expect(html).not.toContain("data-about-me");
      expect(html).not.toContain('data-mention="me"');
    }
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

  // 4c's message menu (docs/decisions.md, 2026-10-26): the Messages list is one stop of the tab order, its newest
  // line; the arrows reach the others, and the line focused scrolls into view.
  it("puts the newest line alone in the tab order, the others reached by the arrows", () => {
    const lines = ["a", "b", "c"].map((id) => line({ id, text: `line ${id}` }));
    const html = view({ state: { ...ROOM, lines } });
    expect([...part(html, "Messages").matchAll(/<li[^>]*tabindex="(-?\d+)"/g)].map((found) => found[1])).toEqual([
      "-1",
      "-1",
      "0",
    ]);
    expect(html).not.toMatch(/<ol [^>]*tabindex=/);
  });

  // The red pass (M12): a line that is a Markdown list holds list items of its own; the tab stop is the line's alone.
  it("gives a line that is a list one tab stop, its own items none", () => {
    const html = part(view({ state: { ...ROOM, lines: [line({ text: "- one\n- two" })] } }), "Messages");
    expect(html.match(/tabindex=/g)).toHaveLength(1);
  });

  // 4c's message menu: Ergo's refusal of a delete, said in the room's flash.
  it("says in the room's flash that Ergo refused to delete a line", () => {
    expect(said(view({ state: { ...ROOM, refused: "a" } }))).toContain("Could not delete the message.");
    expect(said(view())).not.toContain("Could not delete");
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
      '<a href="https://a.example" title="https://a.example" dir="ltr" target="_blank" rel="noopener noreferrer">x</a>',
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

// A part's words as a reader hears them: its tags gone, no space added where none was (R12).
const wordsOf = (html: string) =>
  html
    .replaceAll(/<[^>]+>/g, "")
    .replaceAll("&#x27;", "'")
    .replaceAll("&amp;", "&")
    .trim();
// The Messages list's own lines, each one's words.
const linesOf = (html: string) =>
  [...part(html, "Messages").matchAll(/<li[^>]*>(.*?)<\/li>/gs)].map((m) => wordsOf(m[1] ?? ""));
// Each button's name and pressed state, its attributes in any order (R12).
const pressables = (html: string) =>
  [...html.matchAll(/<button[^>]*>/g)].flatMap(([tag]) => {
    const name = /\saria-label="([^"]+)"/.exec(tag)?.[1];
    const pressed = /\saria-pressed="(true|false)"/.exec(tag)?.[1];
    return name === undefined || pressed === undefined ? [] : [`${name} (${pressed})`];
  });

// 4d: under a line, its reactions as the design system's chips, an emoji and its count, the reader's own pressed, each
// named for a screen reader (its emoji, its count, "including you": docs/DESIGN-SYSTEM.md), out of the list's live
// announcements; 20 distinct emoji a line at most, the rest said in a word (docs/decisions.md, 2026-10-26).
describe("RoomView: reactions", () => {
  // The view reads no msgid of a reaction: each keeps the same.
  const reaction = (to: string, emoji: string, who: string) => ({ id: "r", time: T0, to, emoji, who, on: true });
  const REACTIONS = [
    reaction("a", "👍", ALICE),
    reaction("a", "👍", BOB),
    reaction("a", "😂", ALICE),
    { ...reaction("b", "❤️", ALICE), on: false },
  ];
  const TWO = [line({ id: "a", text: "first" }), line({ id: "b", text: "second" })];
  // 25 distinct emoji on a line, by one account.
  const MANY = [...new Intl.Segmenter().segment("😀😁😂🤣😃😄😅😆😉😊😋😎😍😘🥰😗😙🥲😚🙂🤗🤩🤔🫡🤨")].map(
    ({ segment }) => reaction("a", segment, ALICE),
  );

  it("shows a line's reactions under it to an account, as chips it may press, its own pressed", () => {
    const html = view({ me: BOB, onReact: () => true, state: { ...ROOM, lines: TWO, reactions: REACTIONS } });
    expect(pressables(part(html, "Messages"))).toEqual(["👍, 2, including you (true)", "😂, 1 (false)"]);
    expect(linesOf(html)).toEqual([expect.stringMatching(/first👍 2😂 1$/), expect.stringMatching(/second$/)]);
  });

  it("shows a line's reactions to a guest as words it cannot press", () => {
    const html = view({ state: { ...ROOM, lines: TWO, reactions: REACTIONS } });
    expect(part(html, "Messages")).not.toContain("<button");
    expect(linesOf(html)[0]).toMatch(/first👍 2😂 1$/);
  });

  it("keeps a line's reactions out of the list's live announcements", () => {
    const html = part(
      view({ me: BOB, onReact: () => true, state: { ...ROOM, lines: TWO, reactions: REACTIONS } }),
      "Messages",
    );
    expect(html).toMatch(/<div[^>]*\saria-live="off"[^>]*>(?:(?!<\/div>).)*👍/s);
  });

  it("shows 20 distinct emoji a line at most, and says how many more", () => {
    const html = view({ me: BOB, onReact: () => true, state: { ...ROOM, lines: TWO, reactions: MANY } });
    expect(pressables(part(html, "Messages"))).toHaveLength(20);
    expect(linesOf(html)[0]).toMatch(/\+5 more$/);
  });

  // The green pass (G9): the word comes past the 20th emoji, never at it.
  it.each([
    [20, 20, ""],
    [21, 20, "+1 more"],
  ])("shows %i distinct emoji as %i chips, and says %j", (count, chips, word) => {
    const html = view({
      me: BOB,
      onReact: () => true,
      state: { ...ROOM, lines: TWO, reactions: MANY.slice(0, count) },
    });
    expect(pressables(part(html, "Messages"))).toHaveLength(chips);
    expect(/\+\d+ more/.exec(linesOf(html)[0] ?? "")?.[0] ?? "").toBe(word);
  });

  it("adds 20 Tab stops a line at most: three lines of 25 emoji hold 60 chips", () => {
    const lines = ["a", "b", "c"].map((id) => line({ id, text: id }));
    const reactions = lines.flatMap(({ id }) => MANY.map((each) => ({ ...each, id: `${each.id}${id}`, to: id })));
    const html = part(view({ me: BOB, onReact: () => true, state: { ...ROOM, lines, reactions } }), "Messages");
    expect(html.match(/<button/g)).toHaveLength(60);
  });

  // R8: a reaction names a msgid; another room's line of that msgid is not its line.
  it("shows no reaction whose line is not in the room", () => {
    const html = view({
      me: BOB,
      onReact: () => true,
      state: { ...ROOM, lines: TWO, reactions: [reaction("zz", "👍", ALICE)] },
    });
    expect(part(html, "Messages")).not.toContain("👍");
  });
});

// 4d: above a reply, the line it answers, its author and its words in one line, 70 characters at most, cut between
// graphemes (R6); markup in those words stays text (R5); a line not in this room, another room's of that msgid
// included, is an earlier message (R8).
describe("RoomView: replies", () => {
  const replying = (target: Partial<Line>, reply: Partial<Line> = {}) => [
    line({ id: "a", ...target }),
    line({ id: "b", from: BOB, account: BOB, text: "yes", reply: "a", ...reply }),
  ];

  it("quotes above a reply the line it answers, its author and its words in one line", () => {
    const html = view({ state: { ...ROOM, lines: replying({ text: "the **first** line" }) } });
    expect(linesOf(html)[1]).toMatch(/^Replying to g10gh7…3y5tv: the first line\d{2}:\d{2} g1jg8m…vsqf5 yes$/);
  });

  // F1176 (the UX review's U4): a quote shows a mention as the line does: an author's, the reader's and a member's
  // shortened, anyone else's whole (F812).
  it("shortens a mention in a quote as the line does, never another's", () => {
    const CAROL = "g1jt8gqa4fddp0w803ysa6la4epsdn0hd8wwqcdj";
    const lines = replying({ text: `@${BOB} @${ALICE} @${CAROL}` });
    const quoted = (over: Partial<RoomViewProps>) => linesOf(view({ state: { ...ROOM, lines }, ...over }))[1];
    expect(quoted({})).toContain(`: @g1jg8m…vsqf5 @g10gh7…3y5tv @${CAROL}`);
    expect(quoted({ me: CAROL })).toContain(": @g1jg8m…vsqf5 @g10gh7…3y5tv @g1jt8g…wqcdj");
    expect(quoted({ state: { ...ROOM, lines, members: [CAROL] } })).toContain("@g1jt8g…wqcdj");
  });

  // The security review (S2, F808's class): a line's marks stand at its start, before its quote, so a quoted
  // "Mentions you" is heard after "Replying to", never where the mark stands.
  it("puts a reply's marks before its quote, so quoted words never read as a mark", () => {
    const real = linesOf(
      view({ me: ALICE, state: { ...ROOM, lines: replying({ text: "ok" }, { text: `@${ALICE} yes` }) } }),
    );
    const quoted = linesOf(view({ me: ALICE, state: { ...ROOM, lines: replying({ text: "ok Mentions you" }) } }));
    expect(real[1]).toMatch(/^Mentions you Replying to g10gh7…3y5tv: ok\d{2}:\d{2} /);
    expect(quoted[1]).toMatch(/^Replying to g10gh7…3y5tv: ok Mentions you\d{2}:\d{2} /);
  });

  it("names a guest's line in the quote by its nick, said a guest's", () => {
    const lines = [
      { ...GUEST_LINE, id: "a", text: "hi" },
      line({ id: "b", from: BOB, account: BOB, text: "yes", reply: "a" }),
    ];
    const html = view({ state: { ...ROOM, lines } });
    expect(linesOf(html)[1]).toMatch(/^Replying to guest-ab12cd \(guest\): hi/);
  });

  it("cuts the quote at 70 characters, between two graphemes", () => {
    const long = view({ state: { ...ROOM, lines: replying({ text: "a".repeat(80) }) } });
    expect(linesOf(long)[1]).toContain(`: ${"a".repeat(69)}…`);
    const emoji = view({ state: { ...ROOM, lines: replying({ text: `${"a".repeat(68)}👍🏽${"a".repeat(5)}` }) } });
    expect(linesOf(emoji)[1]).toContain(`: ${"a".repeat(68)}👍🏽…`);
  });

  it("keeps markup and a link of another scheme in the quote as text", () => {
    const hostile = "<img src=x onerror=alert(1)> <script>alert(1)</script> [x](javascript:alert(1))";
    const html = view({ state: { ...ROOM, lines: replying({ text: hostile }) } });
    const quoted = [...part(html, "Messages").matchAll(/<li[^>]*>(.*?)<\/li>/gs)][1]?.[1] ?? "";
    expect(quoted).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(quoted).not.toMatch(/<img|<script|href=/);
  });

  it("says a reply answers an earlier message when the line it answers is not in the room", () => {
    const html = view({ state: { ...ROOM, lines: [line({ id: "b", text: "yes", reply: "gone" })] } });
    expect(linesOf(html)[0]).toMatch(/^Replying to an earlier message\d{2}:\d{2} g10gh7…3y5tv yes$/);
  });

  it("quotes no line from the reply itself: a reply naming its own msgid answers an earlier message", () => {
    const html = view({ state: { ...ROOM, lines: [line({ id: "b", text: "yes", reply: "b" })] } });
    expect(linesOf(html)[0]).toMatch(/^Replying to an earlier message/);
  });
});

// 4d: an edit by the line's own account shown in the line's place, marked edited, its quote reading the edited words;
// another account's edit, or one naming a line not in this room (R8), a line of its own.
describe("RoomView: edits", () => {
  it("shows an edit by the line's own account in its place, marked edited, and quotes the edited words", () => {
    const lines = [
      line({ id: "a", text: "helo" }),
      line({ id: "b", from: BOB, account: BOB, text: "hi", reply: "a" }),
      line({ id: "e", text: "hello", edits: "a" }),
    ];
    const shown = linesOf(view({ state: { ...ROOM, lines } }));
    expect(shown).toHaveLength(2);
    expect(shown[0]).toMatch(/\d{2}:\d{2}( Edited)? g10gh7…3y5tv hello/);
    expect(shown[0]).toMatch(/edited/i);
    expect(shown[1]).toMatch(/^Replying to g10gh7…3y5tv: hello\d/);
  });

  // The green pass: the mark stands with the line's marks, before its time (F808), so a sender's "(edited)" reads as
  // their words, never as the mark.
  it("marks an edited line before its time, and a line that says (edited) not at all", () => {
    const lines = [line({ id: "a", text: "helo" }), line({ id: "e", text: "hello", edits: "a" })];
    expect(linesOf(view({ state: { ...ROOM, lines } }))[0]).toMatch(
      /^(Edited )?\d{2}:\d{2}( Edited)? g10gh7…3y5tv hello$/,
    );
    expect(linesOf(view({ state: { ...ROOM, lines: [line({ id: "s", text: "(edited)" })] } }))[0]).toMatch(
      /^\d{2}:\d{2} g10gh7…3y5tv \(edited\)$/,
    );
  });

  // The code review (CR5): a plain client replies or reacts to the edit's own msgid; both reach the line it corrects.
  it("reads a reply and a reaction to an edit's own msgid as its line's", () => {
    const lines = [
      line({ id: "a", text: "helo" }),
      line({ id: "e", text: "hello", edits: "a" }),
      line({ id: "b", from: BOB, account: BOB, text: "hi", reply: "e" }),
    ];
    const reactions = [{ id: "r1", time: T0, to: "e", emoji: "👍", who: BOB, on: true }];
    const shown = linesOf(view({ state: { ...ROOM, lines, reactions } }));
    expect(shown).toHaveLength(2);
    expect(shown[0]).toMatch(/👍 1$/);
    expect(shown[1]).toMatch(/^Replying to g10gh7…3y5tv: hello\d/);
  });

  it("keeps another account's edit a line of its own, the line it names as written", () => {
    const lines = [
      line({ id: "a", text: "mine" }),
      line({ id: "e", from: BOB, account: BOB, text: "theirs", edits: "a" }),
    ];
    expect(linesOf(view({ state: { ...ROOM, lines } }))).toEqual([
      expect.stringMatching(/ mine$/),
      expect.stringMatching(/ theirs$/),
    ]);
  });

  it("keeps an edit naming a line not in this room, another room's of that msgid included, a line of its own", () => {
    const lines = [line({ id: "b", text: "here" }), line({ id: "e", text: "fixed", edits: "a" })];
    expect(linesOf(view({ state: { ...ROOM, lines } }))).toEqual([
      expect.stringMatching(/ here$/),
      expect.stringMatching(/ fixed$/),
    ]);
  });
});
