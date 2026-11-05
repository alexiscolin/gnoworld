// @vitest-environment jsdom
import { Address } from "@gnoworld/schemas";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ChainCall } from "../../store/chain.ts";
import { all, mount, one } from "../../../tests/mount.tsx";
import { ChainLines } from "./ChainLines.tsx";

// Slice 9g (frames 20 to 35, the activity of a world's room): a line for each call the chain told, in words from the event alone
// (who, what, the block it stands at), drawn as text. With none it draws nothing: a room that shows "kaito voted yes" shows it
// from the chain's event and from nothing a page did first (ADR-0002 §4).
const ALICE = Address.parse("g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv");
const line = (height: number, func = "MustVoteOnProposal", universe = "onyx"): ChainCall => ({
  kind: "call",
  universe,
  world: "govdao",
  realm: "gno.land/r/gov/dao",
  func,
  actor: ALICE,
  height,
});
const bidi = String.fromCodePoint(0x202e);

describe("the chain's lines in a room", () => {
  it("draws nothing with no line", () => {
    expect(renderToStaticMarkup(<ChainLines lines={[]} universe="onyx" />)).toBe("");
  });

  it("is one labelled list, a line for each event, oldest first, each with its caller, its function and its height", () => {
    const box = mount(<ChainLines lines={[line(900030), line(900031, "Execute")]} universe="onyx" />);
    const list = one(box, "ul");
    expect(list.getAttribute("aria-label")).toBe("On chain");
    const items = all(list, "li");
    expect(items).toHaveLength(2);
    expect(items[0]?.textContent).toContain("MustVoteOnProposal");
    expect(items[0]?.textContent).toContain("block 900030");
    expect(items[0]?.textContent).toContain("g10gh7");
    expect(items[1]?.textContent).toContain("Execute");
    expect(items[1]?.textContent).toContain("block 900031");
  });

  it("never draws the whole address as a name a reader could take for another's: the short form, its ends", () => {
    const box = mount(<ChainLines lines={[line(1)]} universe="onyx" />);
    expect(box.textContent).not.toContain(ALICE);
    expect(box.textContent).toContain("g10gh7");
    expect(box.textContent).toContain("y5tv");
  });

  it("draws a line's words as text only, capped, whatever it holds (the schema stops these first; this is the second wall)", () => {
    const hostile = [`<img src=x onerror=alert(1)>`, `Vote${bidi}`, "A".repeat(10_000)];
    const box = mount(<ChainLines lines={hostile.map((func, n) => line(n, func))} universe="onyx" />);
    expect(box.querySelector("img")).toBeNull();
    expect(all(box, "li > *")).toHaveLength(0);
    expect(box.textContent).not.toContain(bidi);
    expect(box.textContent.length).toBeLessThan(600);
  });

  // Red pass: the second wall holds for the actor too, which the schema also stops, and the box stays text and short.
  it("draws an actor of markup, of a bidi override or of 10 KB as short text only", () => {
    for (const actor of [`<img src=x onerror=1>`, `g1${bidi}abcdefghijkl`, `g1${"a".repeat(10_000)}`]) {
      const box = mount(<ChainLines lines={[{ ...line(1), actor: actor as ChainCall["actor"] }]} universe="onyx" />);
      expect(box.querySelector("img")).toBeNull();
      expect(box.textContent).not.toContain(bidi);
      expect(box.textContent.length).toBeLessThan(120);
      expect(all(box, "li")).toHaveLength(1);
      expect(all(box, "li > *")).toHaveLength(0);
    }
  });

  // Red pass: two chains can both have a world "govdao"; a room draws its own universe's calls only.
  it("draws the calls of the page's universe and none of another's, the same world's name or not", () => {
    const box = mount(
      <ChainLines lines={[line(1, "OnyxVote", "onyx"), line(2, "MainnetVote", "gnoland")]} universe="gnoland" />,
    );
    expect(box.textContent).toContain("MainnetVote");
    expect(box.textContent).not.toContain("OnyxVote");
    expect(renderToStaticMarkup(<ChainLines lines={[line(2, "MainnetVote", "gnoland")]} universe="onyx" />)).toBe("");
  });

  it("shows the newest 20 lines of the room at most", () => {
    const box = mount(<ChainLines lines={Array.from({ length: 50 }, (_, n) => line(n))} universe="onyx" />);
    const items = all(box, "li");
    expect(items).toHaveLength(20);
    expect(items[19]?.textContent).toContain("block 49");
  });
});
