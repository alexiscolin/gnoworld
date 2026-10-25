import { compose } from "@gnoworld/core";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Composer, NEAR, Preview, said } from "./Composer.tsx";

const ROOM = "#bubble/games";
const NICK = "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5";
const html = () => renderToStaticMarkup(<Composer room={ROOM} nick={NICK} onSay={() => true} />);
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
