// @vitest-environment jsdom
import { act, useState, type ReactElement } from "react";
import { MemoryRouter } from "react-router";
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
import { Dock } from "./Dock.tsx";
import { QuickActions } from "./QuickActions.tsx";

// The quick actions behind the composer's + (Alexis, 2026-11-08): a menu named "Add to the conversation", an image first, then the
// conversation's own; what a later slice brings is greyed and says "coming soon" (ui's Menu).
describe("the quick actions", () => {
  const draw = (element: ReactElement) => mount(<MemoryRouter>{element}</MemoryRouter>);
  const items = (box: HTMLElement) =>
    all(box, '[role="menuitem"]').map((each) => each.textContent.replace(/Soon$/, ""));
  const POLL = { room: "#bubble", nick: "g1me", say: () => true };

  it("is a menu named Add to the conversation, opened by a + button named Add", () => {
    const box = draw(<QuickActions pills="hub" />);
    expect(one(box, '[role="menu"]').getAttribute("aria-label")).toBe("Add to the conversation");
    expect(one(box, 'button[aria-haspopup="menu"]').getAttribute("aria-label")).toBe("Add");
  });

  it("draws a world's row with no realm: Play and Catch up greyed, Jarvis greyed, and no Poll for a reader who does not write", () => {
    const box = draw(<QuickActions pills="hub" />);
    expect(items(box)).toEqual(["Image", "Play", "Catch up", "Jarvis"]);
    expect(all(box, '[aria-disabled="true"]').map((each) => each.getAttribute("aria-label"))).toEqual([
      "Image, coming soon",
      "Play, coming soon",
      "Catch up, coming soon",
      "Jarvis, coming soon",
    ]);
  });

  it("gives an account Poll, in a world's row, the Earth's and nowhere else", () => {
    expect(items(draw(<QuickActions pills="hub" poll={POLL} />))).toEqual([
      "Image",
      "Play",
      "Catch up",
      "Poll",
      "Jarvis",
    ]);
    expect(items(draw(<QuickActions pills="earth" poll={POLL} />))).toEqual(["Image", "Poll", "Jarvis"]);
    expect(items(draw(<QuickActions pills="earth" />))).toEqual(["Image", "Jarvis"]);
    expect(items(draw(<QuickActions pills="realm" poll={POLL} />))).not.toContain("Poll");
  });

  it("draws a world's row with a realm: Proposal, Realm which acts, Catch up, Jarvis", () => {
    const box = draw(<QuickActions pills="realm" realm="/w/govdao/realm" />);
    expect(items(box)).toEqual(["Image", "Proposal", "Realm", "Catch up", "Jarvis"]);
    expect(button(box, "Realm")?.getAttribute("aria-disabled")).toBeNull();
  });

  it("gives a direct message the image alone: Jarvis reads a room, and a card needs one", () => {
    expect(items(draw(<QuickActions pills="dm" poll={POLL} market={() => undefined} />))).toEqual(["Image"]);
  });

  it("gives Market chart, with its icon, last in a world's rows and first in the Earth's, and asks for the card on a click", () => {
    const market = vi.fn();
    Object.assign(HTMLElement.prototype, { hidePopover: () => undefined });
    expect(items(draw(<QuickActions pills="earth" poll={POLL} market={market} />))).toEqual([
      "Image",
      "Market chart",
      "Poll",
      "Jarvis",
    ]);
    const box = draw(<QuickActions pills="hub" market={market} />);
    expect(items(box).at(-1)).toBe("Market chart");
    click(button(box, "Market chart"));
    expect(market).toHaveBeenCalledTimes(1);
  });

  it("opens Poll's dialog from its item", () => {
    // jsdom has no popover API: the menu hides its panel as an item is chosen.
    Object.assign(HTMLElement.prototype, { hidePopover: () => undefined });
    const box = draw(<QuickActions pills="hub" poll={POLL} />);
    click(button(box, "Poll"));
    expect(one(box, "dialog").textContent).toContain("Ask a poll");
  });
});

// 9e-1 (Alexis, 2026-11-06): the world's pinned actions are pills of their own bar, each shown once vm/qfuncs confirms it;
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
  // The dock as a world's route hands it its pinned actions: the pills in the bar, the cards over it.
  const docked = (actions: PinnedRow[], universe = ONYX) => (
    <Dock
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

  it("puts each confirmed action in the Pinned actions toolbar, one pill each", async () => {
    vi.stubGlobal("fetch", answer(VOTING));
    const box = draw([VOTE]);
    await calling(box, "Vote");
    const bar = one(box, '[role="toolbar"]');
    expect(bar.getAttribute("aria-label")).toBe("Pinned actions");
    expect(all(bar, "button").map((b) => b.textContent)).toEqual(["Vote"]);
    expect(bar.lastElementChild?.contains(button(bar, "Vote") ?? null)).toBe(true);
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

  it("draws no pill while qfuncs does not confirm the action", async () => {
    const read = answer([]);
    vi.stubGlobal("fetch", read);
    const box = draw([VOTE]);
    await vi.waitFor(() => {
      expect(read).toHaveBeenCalled();
    });
    await Promise.allSettled(read.mock.results.map((result) => result.value as unknown));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(all(box, "button").map((b) => b.textContent)).toEqual([]);
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
    expect(all(box, "button").map((b) => b.textContent)).toEqual([]);
    expect(all(box, "article")).toHaveLength(0);
    expect(read).not.toHaveBeenCalled();
  });

  it("asks the chain nothing for a world with no pinned action", () => {
    const read = vi.fn();
    vi.stubGlobal("fetch", read);
    const box = draw([]);
    expect(all(box, "button").map((b) => b.textContent)).toEqual([]);
    expect(read).not.toHaveBeenCalled();
  });
});
