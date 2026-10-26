import type { Line } from "@gnoworld/core";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MEMBERS_SHOWN, People, RoomView, type PeopleProps, type RoomViewProps } from "./RoomView.tsx";

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
// A room as ChatPanel draws one: #games, its topic under its name, who is here beside it.
type Room = { lines: readonly Line[]; members: readonly string[]; topic: string | undefined } | undefined;
type Over = Omit<Partial<RoomViewProps>, "state"> & { state?: Room; onMessage?: PeopleProps["onMessage"] };
const view = ({ onMessage, ...over }: Over = {}) => {
  const state = "state" in over ? over.state : ROOM;
  const { chat = "connected", me } = over;
  const aside = (
    <People members={state?.members ?? []} connected={chat === "connected"} me={me} onMessage={onMessage} />
  );
  return renderToStaticMarkup(
    <RoomView title="#games" note={state?.topic} aside={aside} chat="connected" {...over} state={state} />,
  );
};
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

describe("RoomView", () => {
  it("names the room, its description right after, from its topic", () => {
    expect(view()).toMatch(/<h2[^>]*>#games<\/h2>\s*<p[^>]*>Bubbles here<\/p>/);
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
      /<li class="[^"]*notice[^"]*">.*<span class="[^"]*mark[^"]*">Notice <\/span>.*<span class="[^"]*text[^"]*">heads up<\/span>/s,
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
    expect(html).toMatch(/<li data-about-me="">.*<span class="[^"]*mentionsYou[^"]*">Mentions you <\/span>/s);
    // The mark comes first, before the time: where no sender's words stand (F808).
    expect(first).toMatch(/^Mentions you \d{2}:\d{2} g10gh7…3y5tv ready, @g1jg8m…vsqf5 \?$/);
    expect(html).toMatch(/<li data-about-me=""><span class="[^"]*mentionsYou[^"]*">Mentions you <\/span><time /);
    expect(html).toContain(`<span data-mention="me" title="${BOB}">`);
    expect(html.match(/data-about-me/g)).toHaveLength(1);
    // The line that does not mention the reader carries nothing: no class, no attribute.
    expect(html.match(/<li>/g)).toHaveLength(1);
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
    expect(html).toMatch(/<li class="[^" ]*notice[^" ]*" data-about-me="">/);
    expect(html).toMatch(/<li class="[^" ]*action[^" ]*" data-about-me="">/);
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

  // The lines scroll in a box of their own, which holds nothing focusable: the keyboard reaches it itself (axe's
  // scrollable-region-focusable).
  it("lets the keyboard reach the lines, to scroll them", () => {
    expect(view()).toMatch(
      /<ol [^>]*aria-label="Messages"[^>]*tabindex="0"|<ol [^>]*tabindex="0"[^>]*aria-label="Messages"/i,
    );
  });

  // 4e's UX review (U13): an empty list was a Tab stop of no size, a screen reader saying "Messages, list" of nothing.
  it("is no Tab stop while it holds no line", () => {
    expect(view({ state: { ...ROOM, lines: [] } })).not.toMatch(/<ol [^>]*tabindex/i);
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

  // 4e: an account opens a direct message with another from who is here; a guest has none, nor does one write to
  // itself or to the bot.
  it("offers an account a direct message with each other account here, and nothing else", () => {
    const opened: string[] = [];
    const members = [ALICE, BOB, "guest-ab12cd", "gnoworld"];
    const html = part(view({ me: BOB, state: { ...ROOM, members }, onMessage: (a) => opened.push(a) }), "Who's here");
    // Decision D (U8): a visible "Message", the address after it for a screen reader, which lists many.
    expect([...html.matchAll(/<button[^>]*>(.*?)<\/button>/gs)].map((m) => said(m[1] ?? ""))).toEqual([
      "Message g10gh7…3y5tv",
    ]);
    expect(html).toMatch(/<button[^>]*>.*Message<span class="visually-hidden"> g10gh7…3y5tv<\/span><\/button>/s);
    expect(items(part(view({ state: { ...ROOM, members }, onMessage: () => undefined }), "Who's here"))).toEqual([
      "g10gh7…3y5tv",
      "g1jg8m…vsqf5",
      "guest-ab12cd (guest)",
    ]);
    expect(
      items(part(view({ me: BOB, state: { ...ROOM, members: [ALICE] }, onMessage: () => undefined }), "Who's here")),
    ).toEqual(["g10gh7…3y5tv Message g10gh7…3y5tv"]);
    expect(part(view({ me: BOB, state: { ...ROOM, members } }), "Who's here")).not.toContain("<button");
  });

  // 4e: a direct message's page names its partner, and says it is not encrypted, as every DM does.
  it("names a conversation by the title it is given, its note under it", () => {
    const html = view({ title: "g10gh7…3y5tv", note: "Not encrypted: the server can read these." });
    expect(html).toMatch(/<h2[^>]*>g10gh7…3y5tv<\/h2>\s*<p[^>]*>Not encrypted: the server can read these.<\/p>/);
  });

  // 4e's own review: a conversation has its two people, never a room's "who is here".
  it("leaves who is here out of a conversation", () => {
    const html = view({ title: "g10gh7…3y5tv", aside: undefined });
    expect(html).not.toContain("Who&#x27;s here");
    expect(said(html)).not.toMatch(/\d+ here/);
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

  // 4e's UX review (U5): my own lines read as mine, my name in mint and the word "you" (DESIGN-SYSTEM.md, Avatar).
  it("marks the reader's own lines as theirs, by the word you, and no one else's", () => {
    const lines = [line({ id: "a", text: "mine" }), line({ id: "b", from: BOB, account: BOB, text: "theirs" })];
    const html = part(view({ me: ALICE, state: { ...ROOM, lines } }), "Messages");
    expect(items(html).map((words) => words.replace(/^\d\d:\d\d /, ""))).toEqual([
      "g10gh7…3y5tv you mine",
      "g1jg8m…vsqf5 theirs",
    ]);
    expect(html.match(/data-mine=""/g)).toHaveLength(1);
    expect(items(part(view({ state: { ...ROOM, lines } }), "Messages")).join(" ")).not.toMatch(/\byou\b/);
  });

  // 4e's UX review (U6): the composer reads the note, a direct message's "not encrypted", as its description.
  it("gives its note the id it is given, for the composer to point at", () => {
    expect(view({ note: "Not encrypted.", noteId: "n1" })).toMatch(/<p id="n1"[^>]*>Not encrypted.<\/p>/);
  });

  // 4e: a conversation says why it is empty in words of its own (decisions B, C).
  it("says the words it is given when it holds no line, once connected", () => {
    const html = view({ state: { ...ROOM, lines: [] }, empty: "Nothing kept." });
    expect(said(html)).toContain("Nothing kept.");
    expect(said(html)).not.toContain("No messages yet.");
  });

  it("shows a room it holds nothing of yet as empty, once connected", () => {
    const html = view({ state: undefined });
    expect(said(html)).toContain("No messages yet.");
    expect(said(part(html, "Who's here"))).toContain("0 here");
  });
});
