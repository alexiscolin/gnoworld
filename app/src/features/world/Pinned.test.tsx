// @vitest-environment jsdom
import { act } from "react";
import type { ChainFetch } from "@gnoworld/chain/read";
import { describe, expect, it, vi } from "vitest";
import { StoreProvider } from "../../storeContext.tsx";
import { all, click, mount, one } from "../../../tests/mount.tsx";
import {
  calling,
  CUR,
  field,
  listing,
  onGnoland,
  openedUnsigned,
  prefilled,
  warnsMembers,
} from "../../../tests/callFixtures.ts";
import { PinnedForms } from "./Pinned.tsx";

// 9e-1 (Alexis, 2026-11-06): a world's pinned actions on its page, under Read the proposals, each a Form block under its label once
// vm/qfuncs confirms it, read from the chain of the realm view the world names; anything else draws nothing. NOT recorded: qfuncs' shape.
const DAO = "gno.land/r/gov/dao";
const ANSWER = () =>
  listing([
    {
      FuncName: "MustVoteOnProposalSimple",
      Params: [CUR, field("pid", "int64"), field("option", "string")],
      Results: null,
    },
  ]);
const vote = (over: Record<string, unknown> = {}) => ({
  label: "Vote",
  action: { realm: DAO, function: "MustVoteOnProposalSimple", args: { pid: "15" } },
  view: "/r/gov/dao",
  ...over,
});

function draw(pinned: ReturnType<typeof vote>[], under = vi.fn<ChainFetch>(ANSWER)) {
  return mount(
    <StoreProvider>
      <PinnedForms pinned={pinned} options={{ fetch: under }} />
    </StoreProvider>,
  );
}

describe("a world's pinned actions on its page", () => {
  it("draws each confirmed action as a form under its label, in the data's order, and its card names the realm and function", async () => {
    const box = draw([
      vote(),
      vote({ label: "Vote again", action: { realm: DAO, function: "MustVoteOnProposalSimple", args: {} } }),
    ]);
    await calling(box, "Vote again");
    expect(all(box, "figure")).toHaveLength(2);
    expect(all(box, "button").map((b) => b.textContent)).toEqual(["Vote", "Vote again"]);
    click(await calling(box, "Vote"));
    const card = one(box, "article");
    prefilled(card, ["15", ""], { realm: DAO, func: "MustVoteOnProposalSimple" });
    warnsMembers(card);
  });

  it("reads the functions from the chain the realm view names: onyx's for /r/…", async () => {
    const under = vi.fn<ChainFetch>(ANSWER);
    const box = draw([vote()], under);
    await calling(box, "Vote");
    expect(under.mock.calls.map(([url]) => new URL(url).host)).toContain("rpc.onyx.testnets.gno.land");
  });

  it("reads and signs on gno.land's own chain for a view under /net/gnoland, its card naming gnoland-1", async () => {
    const under = vi.fn<ChainFetch>(ANSWER);
    const box = draw([vote({ view: "/net/gnoland/r/gov/dao" })], under);
    click(await calling(box, "Vote"));
    onGnoland(
      under.mock.calls.map(([url]) => url),
      one(box, "article"),
    );
  });

  it("draws nothing, and asks the chain nothing, for a view of another realm than the action's", async () => {
    const under = vi.fn<ChainFetch>(ANSWER);
    const box = draw([vote({ view: "/r/demo/boards" })], under);
    await act(async () => {
      await Promise.resolve();
    });
    expect(box.childElementCount).toBe(0);
    expect(under).not.toHaveBeenCalled();
  });

  it("only opens the card on its button: no wallet asked, the card's Sign in Adena left for the person", async () => {
    await openedUnsigned(draw([vote()]), "Vote");
  });

  it("draws nothing for an action qfuncs does not confirm, and still draws the one it does", async () => {
    const box = draw([vote({ label: "Drain", action: { realm: DAO, function: "Drain", args: {} } }), vote()]);
    await calling(box, "Vote");
    expect(all(box, "figure")).toHaveLength(1);
    expect(box.textContent).not.toContain("Drain");
  });

  it.each(["/w/govdao", "/net/nowhere/r/gov/dao", "https://evil.example/r/gov/dao"])(
    "draws nothing, and asks the chain nothing, for an action whose view %j is no realm view",
    async (view) => {
      const under = vi.fn<ChainFetch>(ANSWER);
      const box = draw([vote({ view })], under);
      await act(async () => {
        await Promise.resolve();
      });
      expect(box.childElementCount).toBe(0);
      expect(under).not.toHaveBeenCalled();
    },
  );

  it("draws nothing for no action", () => {
    expect(draw([]).childElementCount).toBe(0);
  });
});
