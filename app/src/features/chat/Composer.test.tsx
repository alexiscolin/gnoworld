import { compose } from "@gnoworld/core";
import { completions } from "./complete.ts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Composer, NEAR, Preview, said, typingOf } from "./Composer.tsx";

const ROOM = "#bubble/games";
const NICK = "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5";
const html = () =>
  renderToStaticMarkup(
    <Composer room={ROOM} nick={NICK} rooms={["#games", "#gnogolf"]} members={[]} onSay={() => true} />,
  );
const CHOICES = { commands: ["/me"], rooms: ["#games", "#gnogolf", "#news"], people: [] };
const names = (markup: string) => [...markup.matchAll(/aria-label="([^"]+)"/g)].map((found) => found[1]);

describe("Composer", () => {
  it("is a form named for the room, its field labelled, Send off while the line is empty", () => {
    const markup = html();
    expect(markup).toMatch(/<form[^>]*aria-label="Write in #games"/);
    expect(markup).toMatch(/<label[^>]*>Message #games<\/label>/);
    expect(markup).toMatch(/<button(?=[^>]*type="submit")(?=[^>]*disabled="")[^>]*>/);
    expect(markup).not.toContain("inert");
  });

  it("previews the line out of the keyboard's and the screen reader's reach, its links too", () => {
    const markup = renderToStaticMarkup(
      <Preview composed={compose(ROOM, "**see** [docs](https://gno.land/docs)", NICK)} />,
    );
    expect(markup).toMatch(
      /^<div(?=[^>]* inert="")[^>]*><span><strong>see<\/strong> <a href="https:\/\/gno.land\/docs"/,
    );
    expect(markup).not.toContain("aria-hidden");
  });

  // 4d: the preview reads the line as the room will, the account's own mention apart as it will be.
  it("previews a mention of the account itself apart, as the room will show it, and another's plain", () => {
    const ALICE = "g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv";
    const markup = renderToStaticMarkup(
      <Composer
        room={ROOM}
        nick={NICK}
        rooms={[]}
        members={[]}
        draft={`note to @${NICK} and @${ALICE}`}
        onSay={() => true}
      />,
    );
    expect(markup).toContain(`<span data-mention="me" title="${NICK}">`);
    expect(markup).toContain(`<span data-mention="" title="${ALICE}">`);
  });

  // F812: the preview shortens as the room will, a ground lookalike (BOB's short form) whole.
  it("previews a member's mention shortened and anyone else's whole, as the room will show them (F812)", () => {
    const ALICE = "g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv";
    const ground = "g1jg8m2vtwlmmyz8swgu76ug4tklwnays8yvsqf5";
    const markup = renderToStaticMarkup(
      <Composer
        room={ROOM}
        nick={NICK}
        rooms={[]}
        members={[ALICE, NICK]}
        draft={`@${ALICE} @${ground} @${NICK}`}
        onSay={() => true}
      />,
    );
    expect(markup).toContain(`<span data-mention="" title="${ALICE}">@g10gh7…3y5tv</span>`);
    expect(markup).toContain(`<span data-mention="" title="${ground}">@${ground}</span>`);
    expect(markup).toContain(`<span data-mention="me" title="${NICK}">@g1jg8m…vsqf5</span>`);
  });

  it("starts from the room's draft, its preview with it", () => {
    const markup = renderToStaticMarkup(
      <Composer
        room={ROOM}
        nick={NICK}
        rooms={[]}
        members={[]}
        draft="kept **draft**"
        onDraft={() => undefined}
        onSay={() => true}
      />,
    );
    expect(markup).toMatch(/<input[^>]* value="kept \*\*draft\*\*"/);
    expect(markup).toContain("<strong>draft</strong>");
  });

  it("starts empty with no draft given, and writes a stored draft as a value, never as markup", () => {
    expect(html()).toMatch(/<input[^>]* value=""/);
    const markup = renderToStaticMarkup(
      <Composer room={ROOM} nick={NICK} rooms={[]} members={[]} draft={'"><img src=x onerror=1>'} onSay={() => true} />,
    );
    expect(markup).toContain('value="&quot;&gt;&lt;img src=x onerror=1&gt;"');
    expect(markup).not.toMatch(/<img/);
  });

  it("says nothing of a line not sent before any was", () => {
    expect(html()).not.toMatch(/Not sent|aria-invalid/);
  });

  it("offers each format, by its name, in a group", () => {
    expect(names(html())).toEqual(
      expect.arrayContaining([
        "Format",
        "Bold",
        "Italic",
        "Strikethrough",
        "Code",
        "Link",
        "Quote",
        "Bulleted list",
        "Numbered list",
      ]),
    );
  });
});

describe("what the composer's field says", () => {
  it.each([
    ["", false, {}],
    ["hello", false, {}],
    ["hello", true, { error: "Not sent: the chat is not in this room yet. Try again in a moment." }],
    ["/nick bob", false, { error: "/nick is not a command. /me sends an action." }],
    ["a".repeat(422), false, { error: "Too long by 3 bytes." }],
    ["a".repeat(420), false, { error: "Too long by 1 byte." }],
    ["a".repeat(418), false, { help: "1 byte left." }],
    ["a".repeat(419 - NEAR), false, {}],
    ["a".repeat(420 - NEAR), false, { help: `${String(NEAR - 1)} bytes left.` }],
    ["a".repeat(419), false, { help: "0 bytes left." }],
  ])("says, of %j (failed: %s), %j", (draft, failed, shown) => {
    expect(said(compose(ROOM, draft, NICK), failed)).toStrictEqual(shown);
  });
});

describe("what the composer's field says of a completion", () => {
  const ALICE = "g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv";
  it.each([
    ["/", { help: "Tab completes /me." }],
    ["/m", { help: "Tab completes /me." }],
    ["#g", { help: "Tab completes #games; also #gnogolf." }],
    ["say #n", { help: "Tab completes #news." }],
    ["#n", { help: "Tab completes #news." }],
    ["hi @g10", { help: "Tab completes @g10gh7…3y5tv." }],
    [`${"x".repeat(419)} #g`, { error: "Too long by 3 bytes." }],
    [`${"x".repeat(412)} #g`, { help: "Tab completes #games; also #gnogolf." }],
  ])("says, of %j, %j: an unknown command waits, a line too long does not", (draft, shown) => {
    const choices = { ...CHOICES, people: [ALICE] };
    expect(said(compose(ROOM, draft, NICK), false, completions(draft, choices))).toStrictEqual(shown);
  });

  it("says a line not sent before any completion", () => {
    expect(said(compose(ROOM, "#g", NICK), true, completions("#g", CHOICES))).toStrictEqual({
      error: "Not sent: the chat is not in this room yet. Try again in a moment.",
    });
  });
});

describe("what the composer's field says of three completions", () => {
  it("names the first, then the others, a comma apart", () => {
    const choices = { commands: [], rooms: ["#a1", "#a2", "#a3"], people: [] };
    expect(said(compose(ROOM, "#a", NICK), false, completions("#a", choices))).toStrictEqual({
      help: "Tab completes #a1; also #a2, #a3.",
    });
  });
});

describe("the composer's preview", () => {
  const preview = (draft: string) => renderToStaticMarkup(<Preview composed={compose(ROOM, draft, NICK)} />);
  it("shows the line as the room will read it: an action as one, one slash of two", () => {
    expect(preview("/me **waves**")).toMatch(/inert="">\* <span><strong>waves<\/strong><\/span><\/div>$/);
    expect(preview("//shrug")).toMatch(/inert=""><span>\/shrug<\/span><\/div>$/);
  });

  it("shows nothing of a line that cannot go", () => {
    expect(preview("a".repeat(600))).toBe("");
    expect(preview("/nick bob")).toBe("");
    expect(preview("   ")).toBe("");
  });
});

// 4d's pre-merge: a draft given lets a render show what the composer says of it.
describe("the composer, from a draft", () => {
  const ALICE = "g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv";
  const from = (draft: string) =>
    renderToStaticMarkup(
      <Composer room={ROOM} nick={NICK} rooms={["#games"]} members={[ALICE, NICK]} draft={draft} onSay={() => true} />,
    );
  it.each([
    ["hi @g10", "Tab completes @g10gh7…3y5tv."],
    ["@g10", "Tab completes @g10gh7…3y5tv."],
    ["hi @", "Tab completes @g10gh7…3y5tv."],
    ["/m", "Tab completes /me."],
  ])("says what Tab completes %j to", (draft, help) => {
    expect(from(draft)).toContain(help);
  });

  it.each(["hi@g10", "hi @g10 there", "hi @ g10"])(
    "offers no person for %j: no word after @ ends the draft",
    (draft) => {
      expect(from(draft)).not.toContain("Tab completes @");
    },
  );

  it("leaves Send on for a line that can go, off for one that cannot", () => {
    expect(from("hello")).not.toMatch(/<button(?=[^>]*type="submit")(?=[^>]*disabled)/);
    expect(from("/nick bob")).toMatch(/<button(?=[^>]*type="submit")(?=[^>]*disabled="")[^>]*>/);
  });
});

// 4f: what an edit of the draft tells the room of the account's typing (IRCv3's +typing): a slash command is no
// typing, as the spec has it; a cleared field ends it.
describe("typingOf: what an edit of the draft tells the room", () => {
  it.each([
    ["text", "hello", "active"],
    ["text after spaces", "  hi", "active"],
    ["a cleared field", "", "done"],
    ["spaces alone", "   ", "done"],
    ["a slash command", "/me waves", undefined],
    ["a slash command after spaces", "  /nick bob", undefined],
    // The red pass (R15): as compose reads a draft, `//` a slash of text and a control character a space.
    ["a slash of text", "//shrug", "active"],
    ["a slash command after a tab", "\t/nick bob", undefined],
    ["a slash command after a control character", "\u0001/me hi", undefined],
    ["a slash alone", "/", undefined],
    ["a slash, a control character, then a slash", "/\u0001/shrug", undefined],
    ["control characters alone", "\u0001\u0002", "done"],
  ] as const)("tells %s as %s", (_, draft, told) => {
    expect(typingOf(draft)).toBe(told);
  });
});
