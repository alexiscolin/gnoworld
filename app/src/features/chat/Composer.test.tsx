import { compose } from "@gnoworld/core";
import { completions } from "./complete.ts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Composer, NEAR, Preview, said, typingOf } from "./Composer.tsx";
import { refusalAfter } from "./composerHooks.ts";

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
const CHOICES = { commands: ["/me"], rooms: ["#games", "#gnogolf", "#news"], people: [] };
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
      renderToStaticMarkup(
        <Composer room={ROOM} nick={NICK} rooms={[]} members={[]} onSay={() => true} refused={refused} {...props} />,
      );
    expect(composer({ fresh: true, draft: "fixed" })).toContain("Not sent: g10gh7…3y5tv is not online.");
    expect(composer({ fresh: true, draft: "" })).toMatch(/<input[^>]*value="fixed"/);
    expect(composer({ fresh: false, draft: "" })).not.toContain("Not sent");
    expect(composer({ draft: "" })).not.toContain("Not sent");
    expect(composer({ draft: "" })).not.toMatch(/value="fixed"/);
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
      error: "Not sent: the chat is not ready yet. Try again in a moment.",
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

  // The UX review (U9): typing is told from the first key, so the field says so, until it has something else to say.
  it("tells the writer the room sees them type, unless the field has another help to give", () => {
    const told = "People in this room see when you type.";
    expect(from("")).toContain(told);
    expect(from("hello")).toContain(told);
    expect(from("/m")).not.toContain(told);
    expect(from("a".repeat(400))).not.toContain(told);
    // An error is the field's word alone: the line too long to go.
    expect(from("a".repeat(600))).not.toContain(told);
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
    const describedBy = /<input[^>]*aria-describedby="([^"]+)"/.exec(markup)?.[1] ?? "";
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
    expect(words(draw(to(`${"a".repeat(58)}👩‍👩‍👧‍👦${"a".repeat(5)}`)))).toContain(`: ${"a".repeat(58)}👩‍👩‍👧‍👦…`);
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
    expect(markup).toMatch(/<input[^>]*value="the first words"/);
    expect(markup).toMatch(/<button[^>]*type="submit"[^>]*>Save<\/button>/);
    expect(markup).not.toMatch(/>Send<\/button>/);
  });

  it("describes its field by the bar that says what is edited", () => {
    const markup = draw();
    const ids = (/<input[^>]*aria-describedby="([^"]+)"/.exec(markup)?.[1] ?? "").split(" ");
    const described = ids.map((id) => new RegExp(`<p[^>]*id="${id}"[^>]*>(.*?)</p>`, "s").exec(markup)?.[1] ?? "");
    expect(described.map(words)).toContain("Editing a message");
  });

  // CR4 of the room edit: /me waves in the edit box would turn the message into an action, which has no Edit to turn it back.
  it("refuses to save an edit that composes to an action, and says so", () => {
    const markup = draw({ draft: "/me waves" });
    expect(words(markup)).toContain("An edit cannot be an action.");
    expect(markup).toMatch(
      /<button[^>]*disabled=""[^>]*type="submit"[^>]*>Save<\/button>|<button[^>]*type="submit"[^>]*disabled=""[^>]*>Save<\/button>/,
    );
  });

  it("lets a plain edit save, and an action go as a new message", () => {
    expect(words(draw({ draft: "the new words" }))).not.toContain("An edit cannot be an action.");
    expect(words(draw({ draft: "/me waves", editing: undefined, onCancelEdit: undefined }))).not.toContain(
      "An edit cannot be an action.",
    );
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
    expect(markup).toMatch(/>Send<\/button>/);
  });
});
