// @vitest-environment jsdom
import { Address } from "@gnoworld/schemas";
import { describe, expect, it } from "vitest";
import type { ChainDeploy } from "../../store/chain.ts";
import { all, mount } from "../../../tests/mount.tsx";
import { Ticker } from "./Ticker.tsx";
import { tickerItems } from "./ticker.ts";
import { withChain } from "./tickerChain.ts";

// Slice 9g (frame 6, the ticker's chain line): a realm deployed is a line of the strip, from the chain's event alone, with the
// block it stands at, ahead of the news and still six at most. A deploy of the chain is no external link: it opens the realm's
// own page in the app.
const NOW = new Date("2026-11-05T12:00:00.000Z");
const ALICE = Address.parse("g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv");
const deploy = (height: number, name = "counter", universe = "onyx"): ChainDeploy => ({
  id: `h${String(height)}:0`,
  kind: "deploy",
  universe,
  realm: `gno.land/r/${ALICE}/${name}`,
  actor: ALICE,
  height,
});
const news = (id: string, date: string) => ({ id, title: `News ${id}`, date, link: `https://gno.land/${id}` });

describe("the ticker with the chain's deploys", () => {
  it("puts each deploy first, the newest first, as a chain item naming the realm and the block, linked to the realm's page", () => {
    const items = withChain(tickerItems([news("n1", "2026-11-01")], [], NOW), {
      deploys: [deploy(10, "a"), deploy(11, "b")],
      universe: "onyx",
      prefix: "",
    });
    expect(items.map(({ kind }) => kind)).toEqual(["chain", "chain", "news"]);
    expect(items[0]).toEqual({
      id: `chain-11-gno.land/r/${ALICE}/b`,
      kind: "chain",
      text: expect.stringContaining("b") as string,
      link: `/r/${ALICE}/b`,
    });
    expect(items[0]?.text).toMatch(/deployed/i);
    expect(items[0]?.text).toContain("block 11");
  });

  // Red pass: a deploy's universe is the event's own. Onyx and gno.land are two chains: one's deploy is never a line of the other's strip, and
  // on its own page it links under its own universe's path.
  it("shows a deploy of this page's universe under that universe's own path, and none of another's", () => {
    const mixed = [deploy(10, "mine", "gnoland"), deploy(11, "theirs", "onyx")];
    const gnoland = withChain([], { deploys: mixed, universe: "gnoland", prefix: "/net/gnoland" });
    expect(gnoland.map(({ link }) => link)).toEqual([`/net/gnoland/r/${ALICE}/mine`]);
    const onyx = withChain([], { deploys: mixed, universe: "onyx", prefix: "" });
    expect(onyx.map(({ link }) => link)).toEqual([`/r/${ALICE}/theirs`]);
  });

  it("is still six at most, the chain's first, and changes nothing without any deploy", () => {
    const rows = Array.from({ length: 9 }, (_, i) => news(`n${String(i)}`, `2026-10-${String(10 + i)}`));
    const full = withChain(tickerItems(rows, [], NOW), {
      deploys: Array.from({ length: 8 }, (_, n) => deploy(n)),
      universe: "onyx",
      prefix: "",
    });
    expect(full).toHaveLength(6);
    expect(full.every(({ kind }) => kind === "chain")).toBe(true);
    expect(tickerItems(rows, [], NOW)).toEqual(
      withChain(tickerItems(rows, [], NOW), { deploys: [], universe: "onyx", prefix: "" }),
    );
  });

  it("is drawn with its kind said in words and as a data attribute, a link of the app's own page not opened apart", () => {
    const items = withChain([], { deploys: [deploy(10)], universe: "onyx", prefix: "" });
    const box = mount(<Ticker items={items} />);
    const kinds = all(box, "[data-kind]").filter((each) => each.closest("[aria-hidden='true']") === null);
    expect(kinds.map((each) => each.getAttribute("data-kind"))).toEqual(["chain"]);
    expect(box.textContent).toContain("block 10");
    // The video calls a deploy a signal; the strip draws it in capitals, in the mint of the ticker's kinds.
    expect(kinds.map((each) => each.textContent)).toEqual(["Signal"]);
    const link = all(box, "a").find((each) => each.closest("[aria-hidden='true']") === null);
    expect(link?.getAttribute("href")).toBe(`/r/${ALICE}/counter`);
    expect(link?.getAttribute("target")).toBeNull();
  });
});
