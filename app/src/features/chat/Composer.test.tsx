// @vitest-environment jsdom
import { compose, type Composed } from "@gnoworld/core";
import { renderToStaticMarkup } from "react-dom/server";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { all, markup, noMedia, one } from "../../../tests/mount.tsx";
import { Composer, typingOf } from "./Composer.tsx";
import { NEAR, ROOM_NOTIFIES, ROOM_SILENT, roomHint, said, sendable } from "./said.ts";
import { tooFast } from "./pace.ts";
import { refusalAfter } from "./composerHooks.ts";
import { acting, FIELD, inPage } from "../../../tests/composer.tsx";

const ROOM = "#bubble/games";
const NICK = "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5";
const html = () =>
  renderToStaticMarkup(
    <Composer room={ROOM} nick={NICK} rooms={["#games", "#gnogolf"]} members={[]} onSay={() => true} />,
  );
// A direct message's composer: its room is the partner's address, its label the partner's short one.
const toPartner = () =>
  renderToStaticMarkup(
    <Composer
      room="g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv"
      label="g10gh7…3y5tv"
      nick={NICK}
      rooms={[]}
      members={[]}
      onSay={() => true}
    />,
  );
const names = (markup: string) => [...markup.matchAll(/aria-label="([^"]+)"/g)].map((found) => found[1]);

describe("Composer", () => {
  // /code-review on 4e (CR7): a refusal put its draft back over what the reader had typed since.
  it("puts a refused draft back into an empty box alone; a box holding words keeps them, the unsent ones quoted", () => {
    const refused = { draft: "hi **you**", why: "Not sent: g10gh7…3y5tv is not online." };
    expect(refusalAfter("", refused)).toEqual(refused);
    expect(refusalAfter("typed since", refused)).toEqual({
      draft: "typed since",
      why: "Not sent: g10gh7…3y5tv is not online. Unsent: “hi **you**”",
    });
    expect(refusalAfter("x", { draft: "a".repeat(80), why: "W." }).why).toBe(`W. Unsent: “${"a".repeat(80)}”`);
  });

  // /code-review on 4d's DM bar (CR2): the unsent words were cut at 80 characters, and what a reader had typed since kept
  // the box: the rest of a long correction was lost.
  it("quotes the unsent words whole, however long, and takes a box holding them already for the draft back", () => {
    const long = `${"a".repeat(79)}👍🏽${"b".repeat(200)}`;
    expect(refusalAfter("x", { draft: long, why: "W." }).why).toBe(`W. Unsent: “${long}”`);
    const refused = { draft: "fixed", why: "W." };
    expect(refusalAfter("fixed", refused)).toEqual(refused);
  });

  // The second red pass on the DM bar (R5): the longest draft quoted above is about 280 graphemes, so a cap at 300 or 500
  // went unseen. A line is 512 bytes on the wire at most, but the box holds more.
  it("quotes a draft of 2,000 characters whole", () => {
    const draft = "word ".repeat(400);
    expect(refusalAfter("x", { draft, why: "W." }).why).toBe(`W. Unsent: “${draft}”`);
  });

  // A refused correction taken up again starts its composer on the refusal, not told yet: the reader hears why, and the
  // draft is the box's. A composer that starts on a refusal it already knew tells nothing.
  it("tells a refusal not told yet as it starts, and one it already knew as it starts not", () => {
    const refused = { count: 1, draft: "fixed", why: "Not sent: g10gh7…3y5tv is not online." };
    const composer = (props: { fresh?: boolean; draft: string }) =>
      inPage(
        <Composer room={ROOM} nick={NICK} rooms={[]} members={[]} onSay={() => true} refused={refused} {...props} />,
      );
    expect(composer({ fresh: true, draft: "fixed" }).host.textContent).toContain(
      "Not sent: g10gh7…3y5tv is not online.",
    );
    expect(composer({ fresh: true, draft: "" }).held()).toBe("fixed");
    expect(composer({ fresh: false, draft: "" }).host.textContent).not.toContain("Not sent");
    const none = composer({ draft: "" });
    expect(none.host.textContent).not.toContain("Not sent");
    expect(none.held()).toBe("");
  });

  it("is a form named for the room, its field labelled, Send off while the line is empty", () => {
    const markup = html();
    expect(markup).toMatch(/<form[^>]*aria-label="Write in #games"/);
    expect(markup).toMatch(/<label[^>]*>Message #games<\/label>/);
    expect(markup).toMatch(/<button(?=[^>]*type="submit")(?=[^>]*disabled="")[^>]*>/);
    expect(markup).not.toContain("inert");
  });

  // 4e: a direct message's composer is named for its partner, as the page names the conversation.
  it("names its form and its field by the label it is given, in place of the room's", () => {
    const markup = toPartner();
    expect(markup).toMatch(/<form[^>]*aria-label="Write to g10gh7…3y5tv"/);
    expect(markup).toMatch(/<label[^>]*>Message g10gh7…3y5tv<\/label>/);
  });

  // The merge of 4e and 4f: typing is told to a room, never to a direct message's partner, which its field's help must not say.
  it("says nothing of typing to a direct message's partner, whom none is told", () => {
    expect(toPartner()).not.toContain("see when you type");
  });

  it("starts from the room's draft, its marks drawn as what they mean, and sends it as the same Markdown", () => {
    const page = inPage(
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
    expect(page.box.textContent).toBe("kept draft");
    expect(page.box.querySelector("strong")?.textContent).toBe("draft");
    expect(page.held()).toBe("kept **draft**");
  });

  it("starts empty with no draft given, and writes a stored draft as text, never as markup", () => {
    expect(inPage(<Composer room={ROOM} nick={NICK} rooms={[]} members={[]} onSay={() => true} />).held()).toBe("");
    const page = inPage(
      <Composer room={ROOM} nick={NICK} rooms={[]} members={[]} draft={'"><img src=x onerror=1>'} onSay={() => true} />,
    );
    expect(page.box.textContent).toBe('"><img src=x onerror=1>');
    expect(page.host.querySelector("img")).toBeNull();
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
    ["hello", true, { error: "Not sent: the chat is not ready yet. Try again in a moment." }],
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

// 4f-n (decisions, 2026-10-27, N3): as @room stands in the draft, the field says whether it notifies in this room, and why not.
describe("what the composer's field says of @room", () => {
  it.each([
    ["@room the release is out", true, ROOM_NOTIFIES],
    ["hello @ROOM.", true, ROOM_NOTIFIES],
    ["@room the release is out", false, ROOM_SILENT],
    ["mail@room", false, undefined],
    ["@rooms", false, undefined],
    ["`@room`", false, undefined],
    ["no mention", false, undefined],
    ["no mention", true, undefined],
  ])("says, of %j in a room where it counts (%s), %j", (draft, groups, shown) => {
    expect(roomHint(compose(ROOM, draft, NICK), groups)).toBe(shown);
  });

  it("says nothing of a line that cannot go", () => {
    expect(roomHint(compose(ROOM, `@room ${"a".repeat(420)}`, NICK), true)).toBeUndefined();
  });
});

// 4d's pre-merge: a draft given lets a render show what the composer says of it.
describe("the composer, from a draft", () => {
  const ALICE = "g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv";
  const from = (draft: string, groups?: boolean) =>
    renderToStaticMarkup(
      <Composer
        room={ROOM}
        nick={NICK}
        rooms={["#games"]}
        members={[ALICE, NICK]}
        draft={draft}
        groups={groups}
        onSay={() => true}
      />,
    );
  // C3 of the review: the list of suggestions says what a word may become, so the field's help no longer names it.
  it("says nothing of what Tab completes: the suggestions' list does", () => {
    for (const draft of ["hi @g10", "@g10", "hi @", "/m", "#g"]) expect(from(draft)).not.toContain("Tab completes");
  });

  // N3: the hint is read from the draft as typed or completed, from the room's own rule, none in a direct message.
  it.each([
    [true, ROOM_NOTIFIES],
    [false, ROOM_SILENT],
  ])("says, as @room stands in the draft of a room where it counts (%s), %j", (groups, told) => {
    const markup = renderToStaticMarkup(
      <Composer
        room={ROOM}
        nick={NICK}
        rooms={[]}
        members={[]}
        draft="@room hello"
        groups={groups}
        onSay={() => true}
      />,
    );
    expect(markup).toContain(told);
  });

  it("leaves an error its place before the hint", () => {
    const withGroups = (draft: string) =>
      renderToStaticMarkup(
        <Composer room={ROOM} nick={NICK} rooms={[]} members={[]} draft={draft} groups onSay={() => true} />,
      );
    expect(withGroups(`@room ${"a".repeat(600)}`)).not.toContain(ROOM_NOTIFIES);
  });

  // F1680 (CR8): the hint said "everyone" and hid behind the bytes left or a Tab completion, so a sender could guess.
  it("says what @room does ahead of the bytes left and of a completion", () => {
    const near = from(`@room ${"a".repeat(400)}`, true);
    expect(near).toContain(ROOM_NOTIFIES);
    expect(near).not.toContain("bytes left");
    const completing = from("@room hi @r", true);
    expect(completing).toContain(ROOM_NOTIFIES);
    expect(completing).not.toContain("Tab completes");
    expect(ROOM_NOTIFIES).not.toContain("everyone");
  });

  it("says nothing of @room in a direct message's composer", () => {
    const markup = renderToStaticMarkup(
      <Composer
        room={ALICE}
        label="g10gh7…3y5tv"
        nick={NICK}
        rooms={[]}
        members={[]}
        draft="@room"
        onSay={() => true}
      />,
    );
    expect(markup).not.toContain("@room notifies");
  });

  it("says @room does not notify in a room whose page told nothing of the rooms where it counts", () => {
    const markup = renderToStaticMarkup(
      <Composer room={ROOM} nick={NICK} rooms={[]} members={[]} draft="@room hello" onSay={() => true} />,
    );
    expect(markup).toContain(ROOM_SILENT);
    expect(markup).not.toContain(ROOM_NOTIFIES);
  });

  it("leaves Send on for a line that can go, off for one that cannot", () => {
    expect(from("hello")).not.toMatch(/<button(?=[^>]*type="submit")(?=[^>]*disabled)/);
    expect(from("/nick bob")).toMatch(/<button(?=[^>]*type="submit")(?=[^>]*disabled="")[^>]*>/);
  });
});

// draft/multiline (docs/decisions.md row 255): Shift+Enter adds a line to the draft, Enter sends it; a message of
// several lines goes as it is, and what keeps it from going is said.
describe("the composer, a draft of several lines", () => {
  const from = (draft: string) =>
    renderToStaticMarkup(
      <Composer room={ROOM} nick={NICK} rooms={["#games"]} members={[]} draft={draft} onSay={() => true} />,
    );

  it("holds the draft in a box of several lines, labelled for the room", () => {
    expect(from("")).toMatch(/<div[^>]*role="textbox"[^>]*aria-multiline="true"/);
    expect(from("")).not.toMatch(/<textarea/);
  });

  // Alexis, 2026-11-08 (D418): no standing hint under the field, of the typing nor of how to add a line.
  it("says nothing under an empty field", () => {
    const markup = from("");
    expect(markup).not.toContain("Shift+Enter adds a line.");
    expect(markup).not.toContain("see when you type");
  });

  it("says what keeps a draft from going in the box, in place of the hint", () => {
    const markup = from("/nick bob");
    expect(markup).toContain("/nick is not a command. /me sends an action.");
    expect(markup).not.toContain("Shift+Enter adds a line.");
  });

  it("does not call a command being typed unknown while its suggestions are open", () => {
    expect(from("/")).not.toContain("is not a command");
    expect(from("/ma")).not.toContain("is not a command");
  });

  it("names the line too long, from 1, and a message too many lines by how many", () => {
    const long = compose(ROOM, `one\ntwo\n${"a".repeat(480)}`, NICK);
    expect(said(long, false)).toStrictEqual({
      error: expect.stringMatching(/^Line 3 is too long by \d+ bytes\.$/) as string,
    });
    expect(said(compose(ROOM, Array.from({ length: 42 }, () => "x").join("\n"), NICK), false)).toStrictEqual({
      error: "2 lines too many: 40 at most.",
    });
  });

  it("says a draft holding half of an emoji cannot go, and Send off, not that the chat is not ready (F1717)", () => {
    const message = "This text holds half of an emoji and cannot be sent. Delete it.";
    expect(said(compose(ROOM, "a\ud800b", NICK), false)).toStrictEqual({ error: message });
    expect(from("one\n\ud83d")).toContain(message);
    expect(from("one\n\ud83d")).toMatch(/<button(?=[^>]*type="submit")(?=[^>]*disabled="")[^>]*>/);
  });

  it("leaves Send on for a message of several lines that can go", () => {
    expect(from("- one\n- two")).not.toMatch(/<button(?=[^>]*type="submit")(?=[^>]*disabled)/);
  });

  it("says a message one line or one byte past its caps, and Send off", () => {
    expect(said(compose(ROOM, Array.from({ length: 41 }, () => "x").join("\n"), NICK), false)).toStrictEqual({
      error: "1 line too many: 40 at most.",
    });
    const over = [...Array.from({ length: 10 }, () => "a".repeat(400)), "a".repeat(87)].join("\n");
    expect(said(compose(ROOM, over, NICK), false)).toStrictEqual({ error: "Too long by 1 byte: 4096 at most." });
    expect(from(over)).toMatch(/<button(?=[^>]*type="submit")(?=[^>]*disabled="")[^>]*>/);
  });

  // F1720 (CR8): the line's own budget, about 440 bytes, binds before the message's 4096, and its line is named.
  it("names the line with the fewest bytes left when it has fewer than the message, near its budget", () => {
    const draft = `one\n${"a".repeat(400)}\ntwo`;
    expect(said(compose(ROOM, draft, NICK), false, { nick: NICK })).toStrictEqual({
      help: "Line 2: 19 bytes left.",
    });
    expect(said(compose(ROOM, `one\n${"a".repeat(300)}`, NICK), false, { nick: NICK })).toStrictEqual({});
    // The message's bytes left bind: no line is named.
    const near = [...Array.from({ length: 10 }, () => "a".repeat(400)), "a".repeat(70)].join("\n");
    expect(said(compose(ROOM, near, NICK), false, { nick: NICK })).toStrictEqual({ help: "16 bytes left." });
  });

  // F1718 (CR6): an action is one line, so a draft of several lines after /me loses its breaks without a word.
  it("says an action is one line when the draft after /me holds line breaks, and nothing for one without", () => {
    const note = "An action is one line: its line breaks become spaces.";
    const draft = "/me waves\nhello";
    expect(said(compose(ROOM, draft, NICK), false, { nick: NICK, draft })).toStrictEqual({ help: note });
    expect(said(compose(ROOM, "/me waves", NICK), false, { nick: NICK, draft: "/me waves" })).toStrictEqual({});
    expect(said(compose(ROOM, "/me waves\n", NICK), false, { nick: NICK, draft: "/me waves\n" })).toStrictEqual({});
  });

  it("says an action is one line for a lone CR in the draft too, as compose reads it as a break (R3)", () => {
    const draft = "/me waves\rhello";
    expect(said(compose(ROOM, draft, NICK), false, { nick: NICK, draft })).toStrictEqual({
      help: "An action is one line: its line breaks become spaces.",
    });
  });

  it("names no line when the message has as few bytes left as its tightest line (R3)", () => {
    // Ten lines of 400 bytes leave 19 each of the line's budget; the message's 4096 less 4010 and 67 leaves 19 too.
    const draft = [...Array.from({ length: 10 }, () => "a".repeat(400)), "a".repeat(67)].join("\n");
    expect(said(compose(ROOM, draft, NICK), false, { nick: NICK })).toStrictEqual({ help: "19 bytes left." });
  });

  // F1719 (CR7): without draft/multiline each line goes as a PRIVMSG, and the bot's 20 messages a minute hide the rest.
  it("refuses more than 20 lines when the connection has no draft/multiline, and Send is off", () => {
    const twentyOne = Array.from({ length: 21 }, (_, at) => `line ${String(at)}`).join("\n");
    const composed = compose(ROOM, twentyOne, NICK);
    expect(said(composed, false, { multiline: false })).toStrictEqual({
      error: "1 line too many: 20 at most, as this chat sends one line at a time.",
    });
    expect(said(composed, false, { multiline: true })).toStrictEqual({});
    expect(sendable(composed, false)).toBe(false);
    expect(sendable(composed, true)).toBe(true);
    expect(sendable(compose(ROOM, twentyOne.split("\n").slice(0, 20).join("\n"), NICK), false)).toBe(true);
    expect(sendable(compose(ROOM, "/nick bob", NICK), true)).toBe(false);
    expect(sendable(compose(ROOM, "hi", NICK), false)).toBe(true);
  });

  // R2: undefined is "not known yet" (a story, the connection's start), which blocks nothing: only a false does.
  it("lets 21 to 40 lines go while it is not known whether the connection has draft/multiline", () => {
    const composed = compose(ROOM, Array.from({ length: 40 }, (_, at) => `line ${String(at)}`).join("\n"), NICK);
    expect(said(composed, false, {})).toStrictEqual({});
    expect(said(composed, false, { multiline: undefined })).toStrictEqual({});
    expect(sendable(composed, undefined)).toBe(true);
    expect(sendable(composed, false)).toBe(false);
  });

  it("leaves Send off for a draft past 20 lines in a box told there is no draft/multiline", () => {
    const twentyOne = Array.from({ length: 21 }, (_, at) => `line ${String(at)}`).join("\n");
    const markup = renderToStaticMarkup(
      <Composer
        room={ROOM}
        nick={NICK}
        rooms={["#games"]}
        members={[]}
        draft={twentyOne}
        multiline={false}
        onSay={() => true}
      />,
    );
    expect(markup).toContain("1 line too many: 20 at most, as this chat sends one line at a time.");
    expect(markup).toMatch(/<button(?=[^>]*type="submit")(?=[^>]*disabled="")[^>]*>/);
  });

  it("says the bytes a message of several lines has left near its cap", () => {
    const near = [...Array.from({ length: 10 }, () => "a".repeat(400)), "a".repeat(70)].join("\n");
    expect(said(compose(ROOM, near, NICK), false)).toStrictEqual({ help: "16 bytes left." });
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

// 4d: Reply on a line's bar: the composer says which line the next one answers, its author and its words in one line,
// 60 characters at most, cut between graphemes (R6), markup as text (R5); and offers to answer none.
describe("Composer: a reply", () => {
  const ALICE = "g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv";
  const draw = (over: Partial<Parameters<typeof Composer>[0]> = {}) =>
    renderToStaticMarkup(<Composer room={ROOM} nick={NICK} rooms={[]} members={[]} onSay={() => true} {...over} />);
  const words = (markup: string) => markup.replaceAll(/<[^>]+>/g, "");
  const to = (text: string, guest = false) => ({
    replying: { who: ALICE, guest, text },
    onCancelReply: () => undefined,
  });

  it("says the line it answers, its author and its words, and offers to cancel", () => {
    const markup = draw(to("the **first** line"));
    expect(words(markup)).toContain("Replying to g10gh7…3y5tv: the first line");
    expect(names(markup)).toContain("Cancel the reply");
  });

  // The code review (CR7): the field, which Reply focuses, is described by the bar that says which line it answers.
  it("describes its field by the line it answers", () => {
    const markup = draw(to("the first line"));
    const describedBy = /<[^>]*role="textbox"[^>]*aria-describedby="([^"]+)"/.exec(markup)?.[1] ?? "";
    const ids = describedBy.split(" ");
    // The field is described by its help too (4f's typing disclosure): the bar is one of what describes it.
    const described = ids.map((id) => new RegExp(`<p[^>]*id="${id}"[^>]*>(.*?)</p>`, "s").exec(markup)?.[1] ?? "");
    expect(described.map(words)).toContain("Replying to g10gh7…3y5tv: the first line");
  });

  // F1176 (the UX review's U4): the bar shows a mention as the line does, a member's and the reader's shortened.
  it("shortens a mention of a member or of the reader in the words, no other", () => {
    const CAROL = "g1jt8gqa4fddp0w803ysa6la4epsdn0hd8wwqcdj";
    const quoted = (text: string) => words(draw({ ...to(text), members: [ALICE] }));
    expect(quoted(`@${ALICE} @${NICK}`)).toContain(": @g10gh7…3y5tv @g1jg8m…vsqf5");
    expect(quoted(`@${CAROL}`)).toContain(`: @${CAROL}`);
  });

  it("names a guest's line by its nick, said a guest's", () => {
    const markup = draw({ replying: { who: "guest-ab12cd", guest: true, text: "hi" }, onCancelReply: () => undefined });
    expect(words(markup)).toContain("Replying to guest-ab12cd (guest): hi");
  });

  it("cuts the words at 60 characters, between two graphemes", () => {
    expect(words(draw(to("a".repeat(80))))).toContain(`: ${"a".repeat(59)}…`);
    expect(words(draw(to(`${"a".repeat(58)}👩\u200d👩\u200d👧\u200d👦${"a".repeat(5)}`)))).toContain(
      `: ${"a".repeat(58)}👩\u200d👩\u200d👧\u200d👦…`,
    );
  });

  it("keeps markup and a link of another scheme in the words as text", () => {
    const markup = draw(to("<img src=x onerror=alert(1)> <script>alert(1)</script> [x](javascript:alert(1))"));
    expect(markup).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(markup).not.toMatch(/<img|<script|href=/);
  });

  it("says nothing of a reply when it answers no line", () => {
    const markup = draw();
    expect(words(markup)).not.toContain("Replying to");
    expect(names(markup)).not.toContain("Cancel the reply");
  });
});

// What Enter does in the composer's box, which the markup tests above cannot say (they render, they press nothing): the
// form's submit is the only gate on the Enter path, as requestSubmit() ignores the Send button's disabled (R5).
describe("Enter in the composer's box", () => {
  const lines = (count: number) => Array.from({ length: count }, (_, at) => `line ${String(at)}`).join("\n");

  // Presses Enter in the box of a composer holding `draft`; what onSay was given, and the page.
  async function enter(draft: string, props: Partial<Parameters<typeof Composer>[0]> = {}) {
    const went: Composed[] = [];
    const page = inPage(
      <Composer
        room={ROOM}
        nick={NICK}
        rooms={["#games"]}
        members={[]}
        draft={draft}
        onSay={(composed) => {
          went.push(composed);
          return true;
        }}
        {...props}
      />,
    );
    await page.press("Enter");
    return { went, page };
  }

  it("sends a draft of 21 lines on a connection with draft/multiline, once", async () => {
    expect((await enter(lines(21), { multiline: true })).went).toHaveLength(1);
  });

  it("sends a draft of 21 lines while it is not known whether the connection has it (R2)", async () => {
    expect((await enter(lines(21), { multiline: undefined })).went).toHaveLength(1);
  });

  it("sends nothing of 21 lines on a connection without draft/multiline, whatever the Send button says", async () => {
    expect((await enter(lines(21), { multiline: false })).went).toEqual([]);
  });

  // F2092 (AP3): the composer asks the link, as Send is pressed, whether the account is past the server's pace.
  it("sends nothing and keeps the draft when the link says the account is too fast, and says why", async () => {
    const why = tooFast({ limit: "messages", wait: 12_001 });
    expect(why).toBe("Too fast: 20 messages a minute at most. Try again in 13 s.");
    const { went, page } = await enter("hello", { slow: () => why });
    expect(went).toEqual([]);
    expect(page.host.textContent).toContain(why);
    expect(page.held()).toBe("hello");
  });

  it("names the lines' limit as it names the messages'", () => {
    expect(tooFast({ limit: "lines", wait: 1000 })).toBe("Too fast: 100 lines a minute at most. Try again in 1 s.");
  });

  it("sends the draft when the link says nothing against it", async () => {
    expect((await enter("hello", { slow: () => undefined })).went).toHaveLength(1);
  });
});

// 4d-dm-bar: Edit on one's own line in a direct message puts its words in the box, to send as a correction (our own
// convention, docs/decisions.md 2026-10-21); the bar over the field says so and offers to cancel, Send reads Save.
describe("Composer: an edit", () => {
  const PARTNER = "g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv";
  const draw = (over: Partial<Parameters<typeof Composer>[0]> = {}) =>
    renderToStaticMarkup(
      <Composer
        room={PARTNER}
        label="g10gh7…3y5tv"
        nick={NICK}
        rooms={[]}
        members={[]}
        onSay={() => true}
        draft="the first words"
        editing
        onCancelEdit={() => undefined}
        {...over}
      />,
    );
  const words = (markup: string) => markup.replaceAll(/<[^>]+>/g, "");

  it("says a message is being edited, offers to cancel, starts from its words and sends with Save", () => {
    const markup = draw();
    expect(words(markup)).toContain("Editing a message");
    expect(names(markup)).toContain("Cancel the edit");
    expect(markup).toMatch(/<button[^>]*type="submit"[^>]*>.*>Save<\/span><\/button>/);
    expect(markup).not.toMatch(/>Send<\/span><\/button>/);
  });

  it("starts from the words of the message edited, and sends with Save", () => {
    const page = inPage(
      <Composer room={ROOM} nick={NICK} rooms={[]} members={[]} onSay={() => true} draft="the first words" editing />,
    );
    expect(page.held()).toBe("the first words");
  });

  it("describes its field by the bar that says what is edited", () => {
    const markup = draw();
    const ids = (/<[^>]*role="textbox"[^>]*aria-describedby="([^"]+)"/.exec(markup)?.[1] ?? "").split(" ");
    const described = ids.map((id) => new RegExp(`<p[^>]*id="${id}"[^>]*>(.*?)</p>`, "s").exec(markup)?.[1] ?? "");
    expect(described.map(words)).toContain("Editing a message");
  });

  // CR4 of the room edit: /me waves in the edit box would turn the message into an action, which has no Edit to turn it back.
  it("refuses to save an edit that composes to an action, and says so", () => {
    const markup = draw({ draft: "/me waves" });
    expect(words(markup)).toContain("An edit cannot be an action.");
    expect(markup).toMatch(
      /<button[^>]*disabled=""[^>]*type="submit"[^>]*>.*>Save<\/span><\/button>|<button[^>]*type="submit"[^>]*disabled=""[^>]*>.*>Save<\/span><\/button>/,
    );
  });

  it("lets a plain edit save, and an action go as a new message", () => {
    const enabled = (markup: string) => !/<button[^>]*disabled=""[^>]*>.*>(Save|Send)<\/span><\/button>/.test(markup);
    const edit = draw({ draft: "the new words" });
    const action = draw({ draft: "/me waves", editing: undefined, onCancelEdit: undefined });
    expect(words(edit)).not.toContain("An edit cannot be an action.");
    expect(words(action)).not.toContain("An edit cannot be an action.");
    expect([enabled(edit), enabled(action)]).toEqual([true, true]);
  });

  // CR3 of the room edit: the line being corrected went, so the edit closed; the box, plain again, tells why its words went.
  it("says the message is gone when the edit's line left, until the draft changes", () => {
    const markup = draw({ gone: true, editing: undefined, onCancelEdit: undefined, draft: "" });
    expect(words(markup)).toContain("That message is gone.");
    expect(words(draw({ editing: undefined, onCancelEdit: undefined }))).not.toContain("That message is gone.");
  });

  it("shows no edit bar, Send as it was, and no Cancel when nothing is edited", () => {
    const markup = draw({ editing: undefined, onCancelEdit: undefined });
    expect(words(markup)).not.toContain("Editing a message");
    expect(names(markup)).not.toContain("Cancel the edit");
    expect(markup).toMatch(/>Send<\/span><\/button>/);
  });
});

// R3 (redpass2-red): the static markup tests check the disabled button, not the form's own submit handler, which a
// keyboard's Enter reaches with the button disabled. A mounted composer, its form submitted.
describe("Composer: submitting an edit", () => {
  const PARTNER = "g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv";
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  // jsdom has no popover: the format bar's menu asks for it as it mounts.
  HTMLElement.prototype.togglePopover = () => false;
  const host = document.createElement("div");
  const root = createRoot(host);
  beforeEach(() => {
    noMedia();
  });
  afterEach(() => {
    act(() => {
      root.render(null);
    });
    vi.unstubAllGlobals();
  });

  const submit = (draft: string, over: { editing?: true } = { editing: true }) => {
    const onSay = vi.fn(() => true);
    act(() => {
      root.render(
        <Composer room={PARTNER} nick={NICK} rooms={[]} members={[]} onSay={onSay} draft={draft} {...over} />,
      );
    });
    const form = host.querySelector("form");
    act(() => {
      form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    return onSay;
  };

  it("sends nothing for /me waves in an edit, which would turn the message into an action", () => {
    expect(submit("/me waves")).not.toHaveBeenCalled();
  });

  it("saves //me waves, which is plain text", () => {
    const onSay = submit("//me waves");
    // onSay is given what compose made of the draft, then the draft: "//me waves" is plain text, not an action.
    expect(onSay).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ action: false, text: "/me waves" }),
      "//me waves",
    );
  });

  it("still sends /me waves as a new message when no edit is open", () => {
    expect(submit("/me waves", {})).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ action: true, text: "waves" }),
      "/me waves",
    );
  });
});

// 5q: the composer of the video (frame 23.58.01, bottom): one rounded box holding the format bar, the field and the send
// button. The box is a group; its edge is what the reader sees as the composer.
const boxed = () =>
  markup(<Composer room="#bubble/games" nick={NICK} rooms={["#games"]} members={[]} onSay={() => true} />);

describe("the composer's box", () => {
  it("holds the format bar, the field and the send button in one group named Message box", () => {
    const box = one(boxed(), '[role="group"][aria-label="Message box"]');
    expect(all(box, '[role="group"][aria-label="Format"]')).toHaveLength(1);
    expect(all(box, FIELD)).toHaveLength(1);
    expect(all(box, "button[type='submit']")).toHaveLength(1);
  });

  it("keeps the box inside the form, so Enter and the send button still say the line", () => {
    const view = boxed();
    expect(one(view, "form").contains(one(view, '[aria-label="Message box"]'))).toBe(true);
  });
});

// The card commands: each sends its card's line as any message, so every reader's page draws the card and a guest's goes the same way.
describe("the composer's card commands", () => {
  const sent = async (draft: string, label?: string) => {
    const onSay = vi.fn(() => true);
    const page = inPage(
      <Composer room={ROOM} nick={NICK} rooms={[]} members={[]} onSay={onSay} draft={draft} label={label} />,
    );
    await acting(() => {
      page.host.querySelector("form")?.requestSubmit();
    });
    return { onSay, page };
  };

  it.each([
    ["/market GNOT", "💹 Market prices GNOT"],
    ["/trending", "📈 Most called worlds this week"],
    ["/proposals", "🏛️ GovDAO proposals"],
  ])("sends %s as the line any client reads, and empties the field", async (draft, text) => {
    const { onSay, page } = await sent(draft);
    expect(onSay).toHaveBeenCalledTimes(1);
    expect(onSay.mock.calls[0]).toMatchObject([{ kind: "line", text }, draft]);
    expect(page.held()).toBe("");
  });

  it("refuses an unknown token in words, sending nothing", async () => {
    const { onSay, page } = await sent("/market eth");
    expect(onSay).not.toHaveBeenCalled();
    expect(page.host.textContent).toContain("/market takes one token");
  });

  it("is an unknown command in a direct message, which has no room for the card", async () => {
    const { onSay, page } = await sent("/trending", "g10gh7…3y5tv");
    expect(onSay).not.toHaveBeenCalled();
    expect(page.host.textContent).toContain("/trending is not a command");
  });
});
