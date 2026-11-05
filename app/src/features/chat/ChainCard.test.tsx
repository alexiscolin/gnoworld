// @vitest-environment jsdom
import { Address } from "@gnoworld/schemas";
import { describe, expect, it } from "vitest";
import type { ChainCall } from "../../store/chain.ts";
import { all, mount, one } from "../../../tests/mount.tsx";
import { ChainCard } from "./ChainCard.tsx";

// Slice 9g (frames 20 to 35, the activity of a world's room): a call the chain told is a card of the room's thread, in words from the
// event alone (who, what, the realm, the block it stands at), drawn as text. A room that shows "kaito voted yes" shows it from the chain's
// event and from nothing a page did first (ADR-0002 §4).
const ALICE = Address.parse("g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv");
const line = (height: number, func = "MustVoteOnProposal", universe = "onyx"): ChainCall => ({
  id: `h${String(height)}:0`,
  kind: "call",
  universe,
  world: "govdao",
  realm: "gno.land/r/gov/dao",
  func,
  actor: ALICE,
  height,
});
const bidi = String.fromCodePoint(0x202e);
// An item of a list, as the thread holds it.
const mountLine = (call: ChainCall) => {
  const box = mount(
    <ol>
      <ChainCard call={call} />
    </ol>,
  );
  return { box, item: one(box, "li") };
};

describe("the chain's lines in a room", () => {
  it("is one item that is a dashed card with a link icon, its caller and function in its title, its realm and its height under it", () => {
    const { item } = mountLine(line(900030));
    expect(item.hasAttribute("data-chain")).toBe(true);
    expect(one(item, "article").getAttribute("data-edge")).toBe("dashed");
    expect(item.querySelector("svg")).not.toBeNull();
    expect(one(item, "h3").textContent).toBe("g10gh7…y5tv called MustVoteOnProposal");
    expect(one(item, "p").textContent).toBe("on chain, r/gov/dao · block 900030");
  });

  it("never draws the whole address as a name a reader could take for another's: the short form, its ends", () => {
    const { box } = mountLine(line(1));
    expect(box.textContent).not.toContain(ALICE);
    expect(box.textContent).toContain("g10gh7");
    expect(box.textContent).toContain("y5tv");
  });

  it("draws a line's words as text only, capped, whatever it holds (the schema stops these first; this is the second wall)", () => {
    const hostile = [`<img src=x onerror=alert(1)>`, `Vote${bidi}`, "A".repeat(10_000)];
    for (const func of hostile) {
      const { box } = mountLine(line(1, func));
      expect(box.querySelector("img")).toBeNull();
      expect(all(box, "h3 > *")).toHaveLength(0);
      expect(box.textContent).not.toContain(bidi);
      expect(box.textContent.length).toBeLessThan(200);
    }
  });

  // Red pass: the second wall holds for the actor and the realm too, which the schema also stops, and the box stays text and short.
  it("draws an actor of markup, of a bidi override or of 10 KB as short text only", () => {
    for (const actor of [`<img src=x onerror=1>`, `g1${bidi}abcdefghijkl`, `g1${"a".repeat(10_000)}`]) {
      const { box, item } = mountLine({ ...line(1), actor: actor as ChainCall["actor"], realm: `gno.land/r/${actor}` });
      expect(box.querySelector("img")).toBeNull();
      expect(box.textContent).not.toContain(bidi);
      expect(box.textContent.length).toBeLessThan(200);
      expect(all(item, "h3 > *")).toHaveLength(0);
    }
  });
});
