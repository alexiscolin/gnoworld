import { compose } from "@gnoworld/core";
import { completions } from "./complete.ts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Composer, NEAR, Preview, said } from "./Composer.tsx";

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
    const markup = renderToStaticMarkup(<Preview text="**see** [docs](https://gno.land/docs)" />);
    expect(markup).toMatch(
      /^<div(?=[^>]* inert="")[^>]*><span><strong>see<\/strong> <a href="https:\/\/gno.land\/docs"/,
    );
    expect(markup).not.toContain("aria-hidden");
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
