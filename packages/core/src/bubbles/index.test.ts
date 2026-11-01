import * as bubbles from "@gnoworld/core/bubbles";
import * as core from "@gnoworld/core";
import { describe, expect, it } from "vitest";
import type { Bubble, BubbleMessage, Count, LatLon, PickArgs, Picked, Rules, Viewer } from "@gnoworld/core/bubbles";
import rules from "../../../../app/data/bubbles.json" with { type: "json" };

// Slice 6's F3371: slices 7j and 7f start from 6a's types, so the package exposes them as a subpath, the way schemas
// exposes `proposal` and `indexer`. The main entry stays as it is: the first screen's bytes do not carry the bubbles.
describe("@gnoworld/core/bubbles", () => {
  it("gives the pick, the cut, the turn, the far side and the table's lookup", () => {
    expect(Object.keys(bubbles).sort()).toEqual([
      "COUNTRIES",
      "bubbleLines",
      "centreOf",
      "countryName",
      "countryTrends",
      "cutText",
      "isFarSide",
      "isPublicRoom",
      "pickBubbles",
      "turnTo",
    ]);
  });

  it("runs from the app's side, with the shipped rules, and gives the types a caller names", () => {
    const viewer: Viewer = { account: "me", muted: [], banned: [] };
    const now = Date.UTC(2026, 10, 1);
    const message: BubbleMessage = {
      id: "m1",
      at: now - 1000,
      account: "ann",
      text: "hello",
      country: "JP",
      visibility: "public",
      joined: true,
    };
    const args: PickArgs = [[message], now, viewer, rules satisfies Rules, []];
    const out: Picked = bubbles.pickBubbles(...args);
    const shown: Bubble | undefined = out.bubbles[0];
    const where: LatLon | undefined = bubbles.turnTo("JP");
    const counts: readonly Count[] = out.counts;
    expect(shown?.text).toBe("hello");
    expect(where).toEqual(bubbles.centreOf("JP"));
    expect(counts).toEqual([]);
    expect(bubbles.cutText("a".repeat(100), rules.maxChars)).toHaveLength(rules.maxChars);
    expect(bubbles.isFarSide({ lat: 0, lon: 170 }, { lat: 0, lon: -10 })).toBe(true);
  });

  it("leaves the main entry as it was: nothing of the bubbles in it", () => {
    expect(Object.keys(core).filter((name) => /bubble|cutText|turnTo|isFarSide|centreOf/i.test(name))).toEqual([]);
  });
});
