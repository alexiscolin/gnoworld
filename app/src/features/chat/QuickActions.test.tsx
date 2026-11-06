// @vitest-environment jsdom
import { act, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StoreProvider } from "../../storeContext.tsx";
import { all, button, click, mount, one } from "../../../tests/mount.tsx";
import {
  calling,
  CUR,
  field,
  inputs,
  listing,
  onGnoland,
  openedUnsigned,
  pinnedVote,
} from "../../../tests/callFixtures.ts";
import type { PinnedRow } from "../../pinned.ts";
import { PinnedBar } from "../world/Pinned.tsx";
import { Dock } from "./ChatScreen.tsx";
import { QuickActions } from "./QuickActions.tsx";

// 5q: the row of quick actions over the composer (frame 23.58.01, bottom). Only what works today: Who's here.
// The video's Quiz, Poll and Calendar wait for their features.
describe("the quick actions", () => {
  it("is a toolbar named Quick actions holding Who's here, which acts", () => {
    const onWhoIsHere = vi.fn();
    const box = mount(<QuickActions onWhoIsHere={onWhoIsHere} />);
    expect(one(box, '[role="toolbar"]').getAttribute("aria-label")).toBe("Quick actions");
    click(button(box, "Who's here"));
    expect(onWhoIsHere).toHaveBeenCalledTimes(1);
  });

  it("has no Calendar, Quiz or Poll button before there is something behind them", () => {
    const box = mount(<QuickActions onWhoIsHere={() => undefined} />);
    expect(all(box, "button").map((each) => each.textContent)).toEqual(["Who's here"]);
  });
});

// 9e-1 (Alexis, 2026-11-06): the world's pinned actions are pills of the bar after Who's here, each shown once vm/qfuncs confirms it;
// its card opens over the bar, prefilled, naming the realm and function the data says. NOT recorded: qfuncs' shape.
describe("the quick actions of a world with pinned actions", () => {
  const DAO = "gno.land/r/gov/dao";
  const VOTE: PinnedRow = { label: "Vote", realm: DAO, function: "MustVoteOnProposalSimple", args: { pid: "15" } };
  const ONYX = { id: "onyx", isDefault: true };
  const answer = (functions: unknown) => vi.fn(() => listing(functions));
  const VOTING = [
    {
      FuncName: "MustVoteOnProposalSimple",
      Params: [CUR, field("pid", "int64"), field("option", "string")],
      Results: null,
    },
  ];
  afterEach(() => {
    vi.unstubAllGlobals();
  });
  // The dock as a world's route hands it its pinned actions: the pills in the row, the cards over it.
  const docked = (actions: PinnedRow[], universe = ONYX) => (
    <Dock
      onWhoIsHere={() => undefined}
      pinned={{
        pills: <PinnedBar part="pills" actions={actions} universe={universe} at="govdao" />,
        cards: <PinnedBar part="cards" actions={actions} universe={universe} at="govdao" />,
      }}
    >
      {null}
    </Dock>
  );
  const draw = (actions: PinnedRow[], universe = ONYX) =>
    mount(<StoreProvider>{docked(actions, universe)}</StoreProvider>);

  it("puts each confirmed action in the toolbar after Who's here, a pill as Who's here is", async () => {
    vi.stubGlobal("fetch", answer(VOTING));
    const box = draw([VOTE]);
    await calling(box, "Vote");
    const bar = one(box, '[role="toolbar"]');
    expect(all(bar, "button").map((b) => b.textContent)).toEqual(["Who's here", "Vote"]);
    // The row gives each of its own children the pill's look: the pinned pill is one, as Who's here is.
    expect([...bar.children]).toEqual([button(bar, "Who's here"), button(bar, "Vote")]);
  });

  it("opens the card over the bar, out of the toolbar, prefilled and naming the realm and the function", async () => {
    vi.stubGlobal("fetch", answer(VOTING));
    const box = draw([VOTE]);
    click(await calling(box, "Vote"));
    const card = one(box, "article");
    const bar = one(box, '[role="toolbar"]');
    expect(bar.contains(card)).toBe(false);
    expect(card.compareDocumentPosition(bar) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    pinnedVote(card, ["15", ""]);
  });

  it("gives each of two pinned actions its own card: a click on one opens that one only", async () => {
    vi.stubGlobal("fetch", answer(VOTING));
    const box = draw([VOTE, { ...VOTE, label: "Vote on 16", args: { pid: "16" } }]);
    click(await calling(box, "Vote on 16"));
    expect(all(box, "article")).toHaveLength(1);
    expect(inputs(one(box, "article")).map((i) => i.value)).toEqual(["16", ""]);
  });

  it("keeps Who's here alone while qfuncs does not confirm the action", async () => {
    const read = answer([]);
    vi.stubGlobal("fetch", read);
    const box = draw([VOTE]);
    await vi.waitFor(() => {
      expect(read).toHaveBeenCalled();
    });
    await Promise.allSettled(read.mock.results.map((result) => result.value as unknown));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(all(box, "button").map((b) => b.textContent)).toEqual(["Who's here"]);
  });

  it("reads the functions from the chain the view names, gno.land's for /net/gnoland, and its card names gnoland-1", async () => {
    const read = answer(VOTING);
    vi.stubGlobal("fetch", read);
    const box = draw([VOTE], { id: "gnoland", isDefault: false });
    click(await calling(box, "Vote"));
    onGnoland(
      read.mock.calls.map((call: unknown[]) => String(call[0])),
      one(box, "article"),
    );
  });

  it("only opens the card on the pill: no wallet asked, the card's Sign in Adena left for the person", async () => {
    vi.stubGlobal("fetch", answer(VOTING));
    await openedUnsigned(draw([VOTE]), "Vote");
  });

  it("shows another world's bar no card opened in the world before: its pills open their own", async () => {
    vi.stubGlobal(
      "fetch",
      answer([...VOTING, { FuncName: "Join", Params: [CUR, field("name", "string")], Results: null }]),
    );
    const JOIN: PinnedRow = { label: "Join", realm: DAO, function: "Join", args: {} };
    function Moving() {
      const [pinned, setPinned] = useState([VOTE]);
      return (
        <>
          <button
            type="button"
            onClick={() => {
              setPinned([JOIN]);
            }}
          >
            Move
          </button>
          {docked(pinned)}
        </>
      );
    }
    const box = mount(
      <StoreProvider>
        <Moving />
      </StoreProvider>,
    );
    click(await calling(box, "Vote"));
    expect(all(box, "article")).toHaveLength(1);
    click(button(box, "Move"));
    click(await calling(box, "Join"));
    expect(all(box, "article")).toHaveLength(1);
    expect(one(box, "article").textContent).toContain("Join");
    expect(one(box, "article").textContent).not.toContain("MustVoteOnProposalSimple");
  });

  it("draws no pill and no card, and asks the chain nothing, for a universe the site does not know", async () => {
    const read = vi.fn();
    vi.stubGlobal("fetch", read);
    const box = draw([VOTE], { id: "nowhere", isDefault: false });
    await act(async () => {
      await Promise.resolve();
    });
    expect(all(box, "button").map((b) => b.textContent)).toEqual(["Who's here"]);
    expect(all(box, "article")).toHaveLength(0);
    expect(read).not.toHaveBeenCalled();
  });

  it("asks the chain nothing for a world with no pinned action", () => {
    const read = vi.fn();
    vi.stubGlobal("fetch", read);
    const box = draw([]);
    expect(all(box, "button").map((b) => b.textContent)).toEqual(["Who's here"]);
    expect(read).not.toHaveBeenCalled();
  });
});
