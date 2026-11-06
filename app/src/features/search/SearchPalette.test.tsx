// @vitest-environment jsdom
import { act } from "react";
import { useLocation, useNavigate } from "react-router";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { mountInStore } from "../../../tests/inStore.tsx";
import { all, button, click, modals, nth, one, settled } from "../../../tests/mount.tsx";
import { site } from "../../places.ts";
import { visitKey } from "../../lib/visits.ts";
import { SEARCH } from "../../scene/openEvent.ts";
import { SearchPalette } from "./SearchPalette.tsx";

// The search drawer (slice 8's 8i; frames 98 to 100): opened by its button and by the chord, closed four ways, its passport block, its groups
// and the row slice 11 fills. Where the browser's own focus, top layer and Esc are needed, the journeys walk it.
vi.mock("../../topPill.tsx", () => import("../../../tests/pills.ts"));
const seen = vi.hoisted(() => ({
  count: vi.fn<() => number | null | undefined>(),
  file: vi.fn<() => unknown>(),
  here: vi.fn<() => Promise<unknown>>(),
  explore: vi.fn<() => Promise<string>>(),
}));
vi.mock("../universe/index.ts", async (original) => ({
  ...(await original<object>()),
  useWorldsCount: seen.count,
}));
vi.mock("../../worldsFile.ts", () => ({ useWorldsFile: seen.file }));
vi.mock("../../lib/api/presence.ts", () => ({ pagePresenceApi: () => ({ read: seen.here }) }));
vi.mock("../home/explore.ts", () => ({ exploreTo: seen.explore }));

const universe = site.universeAt("/");
const DAY = 86_400_000;

function Page() {
  const { pathname, hash } = useLocation();
  const navigate = useNavigate();
  return (
    <>
      <SearchPalette universe={universe} />
      <output data-at="">{pathname + hash}</output>
      <button
        type="button"
        onClick={() => {
          Promise.resolve(navigate("/elsewhere")).catch(reportError);
        }}
      >
        Leave
      </button>
    </>
  );
}

const drawerOf = (box: HTMLElement) => box.querySelector<HTMLDialogElement>("dialog[data-side]");
const isOpen = (box: HTMLElement) => drawerOf(box)?.open ?? false;
const at = (box: HTMLElement) => one(box, "[data-at]").textContent;
const field = (box: HTMLElement) => one(box, "input[role='combobox']");
const labels = (box: HTMLElement) => all(box, "[role='option'] .truncate").map((each) => each.textContent);
const groups = (box: HTMLElement) => all(box, "[role='group'] .label").map((each) => each.textContent);

async function openIt(box: HTMLElement) {
  click(button(box, "Search"));
  await settled(() => isOpen(box));
}
// Closed, then opened again from its button: its field.
async function reopened(box: HTMLElement) {
  click(button(box, "Close"));
  click(button(box, "Search"));
  await settled(() => isOpen(box));
  return field(box);
}

function type(input: HTMLElement, value: string) {
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
const chord = (over: KeyboardEventInit) => {
  const event = new KeyboardEvent("keydown", { key: "k", bubbles: true, cancelable: true, ...over });
  act(() => {
    document.dispatchEvent(event);
  });
  return event;
};

const reported = vi.fn();
beforeAll(modals);
beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("reportError", reported);
  seen.count.mockReturnValue(undefined);
  seen.file.mockReturnValue(undefined);
  seen.here.mockResolvedValue({ ok: true, value: { worlds: [{ world: "bubble", here: 7 }] } });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  expect(reported).not.toHaveBeenCalled();
});

describe("opening the drawer", () => {
  it("is not drawn before it is asked: the first screen holds the button alone", async () => {
    const { box } = await mountInStore(<Page />);
    expect(drawerOf(box)).toBeNull();
    expect(button(box, "Search")).toBeDefined();
  });

  it("opens by its button with the focus in its field", async () => {
    const { box } = await mountInStore(<Page />);
    await openIt(box);
    expect(document.activeElement).toBe(field(box));
  });

  it("opens by Cmd-K and by Ctrl-K, taking the chord from the browser", async () => {
    const { box } = await mountInStore(<Page />);
    expect(chord({ metaKey: true }).defaultPrevented).toBe(true);
    await settled(() => isOpen(box));
    click(button(box, "Close"));
    expect(isOpen(box)).toBe(false);
    chord({ ctrlKey: true });
    await settled(() => isOpen(box));
  });

  it("leaves a bare k, Shift-K and Alt-K to the page", async () => {
    const { box } = await mountInStore(<Page />);
    for (const over of [{}, { shiftKey: true, metaKey: true }, { altKey: true, ctrlKey: true }]) {
      expect(chord(over).defaultPrevented).toBe(false);
    }
    expect(drawerOf(box)).toBeNull();
  });

  it("keeps a dialog already open: the chord opens no second one", async () => {
    const { box } = await mountInStore(
      <>
        <Page />
        <dialog open aria-label="Another" />
      </>,
    );
    expect(chord({ metaKey: true }).defaultPrevented).toBe(true);
    expect(drawerOf(box)).toBeNull();
  });
});

describe("closing the drawer", () => {
  const cancel = (box: HTMLElement) => {
    const event = new Event("cancel", { cancelable: true });
    act(() => {
      nth(all(box, "dialog"), 0).dispatchEvent(event);
    });
    return event;
  };

  it("closes by Escape, the dialog's cancel, which the page answers", async () => {
    const { box } = await mountInStore(<Page />);
    await openIt(box);
    expect(cancel(box).defaultPrevented).toBe(true);
    expect(isOpen(box)).toBe(false);
  });

  it("closes by Close", async () => {
    const { box } = await mountInStore(<Page />);
    await openIt(box);
    click(button(box, "Close"));
    expect(isOpen(box)).toBe(false);
  });

  it("closes by a click beside it, and stays open for a click inside its box", async () => {
    const { box } = await mountInStore(<Page />);
    await openIt(box);
    const dialog = drawerOf(box);
    const press = (x: number) => {
      act(() => {
        dialog?.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: x, clientY: 0 }));
      });
    };
    // jsdom lays nothing out: its box is empty at 0, 0, so a click at 0, 0 is inside it.
    press(0);
    expect(isOpen(box)).toBe(true);
    press(500);
    expect(isOpen(box)).toBe(false);
  });

  it("closes when the page changes", async () => {
    const { box } = await mountInStore(<Page />);
    await openIt(box);
    click(button(box, "Leave"));
    expect(at(box)).toBe("/elsewhere");
    expect(isOpen(box)).toBe(false);
  });

  it("empties the field as it closes, so it opens empty", async () => {
    const { box } = await mountInStore(<Page />);
    await openIt(box);
    type(field(box), "bub");
    expect(await reopened(box)).toHaveProperty("value", "");
  });
});

describe("the places", () => {
  it("lists every place by kind in the order of the groups, each with its count", async () => {
    const { box } = await mountInStore(<Page />);
    await openIt(box);
    const each = groups(box);
    expect(each.map((label) => label.split(" · ")[0])).toEqual(
      ["Ecosystems", "Hubs and DAOs", "Home", "Universes", "Stations"].filter((label) =>
        each.some((got) => got.startsWith(label)),
      ),
    );
    const total = each.reduce((sum, label) => sum + Number(label.split(" · ")[1]), 0);
    expect(total).toBe(site.places.length);
  });

  it("narrows by the name typed, counts what is left, and Clear brings every place back", async () => {
    const { box } = await mountInStore(<Page />);
    await openIt(box);
    const everything = labels(box).length;
    type(field(box), "bub");
    expect(labels(box).length).toBeGreaterThan(0);
    expect(labels(box).length).toBeLessThan(everything);
    for (const label of labels(box)) expect(label.toLowerCase()).toContain("bub");
    click(button(box, "Clear"));
    expect(labels(box)).toHaveLength(everything);
    expect(field(box)).toHaveProperty("value", "");
  });

  it("lists no place for a query none holds, and offers no Clear for an empty field", async () => {
    const { box } = await mountInStore(<Page />);
    await openIt(box);
    expect(button(box, "Clear")).toBeUndefined();
    type(field(box), "zzzz-nothing");
    expect(labels(box)).toEqual([]);
  });

  it("shows the people in a world beside it, from the server's presence", async () => {
    const { box } = await mountInStore(<Page />);
    await openIt(box);
    const bubble = all(box, "[role='option']").find((each) => each.textContent.includes("Bubble"));
    await settled(() => bubble?.textContent.endsWith("7") ?? false);
    expect(bubble?.textContent.endsWith("7")).toBe(true);
  });

  it("shows no count when the server says nothing", async () => {
    seen.here.mockResolvedValue({ ok: false });
    const { box } = await mountInStore(<Page />);
    await openIt(box);
    await act(async () => {
      await Promise.resolve();
    });
    const bubble = all(box, "[role='option']").find((each) => each.textContent.includes("Bubble"));
    // Its name and its kind's tag (8p, frame 98), and no count.
    expect(bubble?.textContent).toBe("BubbledApp");
  });

  it("goes to a place chosen and closes", async () => {
    const { box } = await mountInStore(<Page />);
    await openIt(box);
    const bubble = all(box, "[role='option']").find((each) => each.textContent.includes("Bubble"));
    click(bubble);
    await settled(() => at(box) === "/w/bubble");
    expect(isOpen(box)).toBe(false);
  });
});

describe("the coming-soon row", () => {
  it("is there while nothing is typed and while the query is part of its name", async () => {
    const { box } = await mountInStore(<Page />);
    await openIt(box);
    expect(box.textContent).toContain("Satellites anyone can rent");
    type(field(box), "satel");
    expect(box.textContent).toContain("Satellites anyone can rent");
  });

  it("is gone for a query that is no part of its name, whatever the case", async () => {
    const { box } = await mountInStore(<Page />);
    await openIt(box);
    type(field(box), "bub");
    expect(box.textContent).not.toContain("Satellites anyone can rent");
    type(field(box), "  SPONSORED ");
    expect(box.textContent).toContain("Satellites anyone can rent");
  });
});

describe("the passport block", () => {
  const block = (box: HTMLElement) => one(box, "section[aria-label='Your passport']");

  it("counts the worlds this device stamped in the universe, out of those listed", async () => {
    localStorage.setItem(
      "gnoworld:device:stamps",
      JSON.stringify({
        [`${universe.id}:a`]: "2026-11-01",
        [`${universe.id}:b`]: "2026-11-02",
        "other:c": "2026-11-02",
      }),
    );
    seen.count.mockReturnValue(19);
    const { box } = await mountInStore(<Page />);
    await openIt(box);
    await settled(() => block(box).textContent.includes("/ 19"));
    expect(block(box).textContent).toContain("2 / 19");
  });

  it("shows the stamps alone while the listed count is unknown", async () => {
    localStorage.setItem("gnoworld:device:stamps", JSON.stringify({ [`${universe.id}:a`]: "2026-11-01" }));
    const { box } = await mountInStore(<Page />);
    await openIt(box);
    expect(block(box).textContent).toContain("1");
    expect(block(box).textContent).not.toContain("/");
  });

  it("never lets the stamps pass the listed", async () => {
    localStorage.setItem(
      "gnoworld:device:stamps",
      JSON.stringify({ [`${universe.id}:a`]: "2026-11-01", [`${universe.id}:b`]: "2026-11-02" }),
    );
    seen.count.mockReturnValue(1);
    const { box } = await mountInStore(<Page />);
    await openIt(box);
    await settled(() => block(box).textContent.includes("/"));
    expect(block(box).textContent).toContain("2 / 2");
  });

  const world = (id: string, seenAt: string | null) => ({ id, namespace: id, realms: [], seen: seenAt });
  const signals = async (box: HTMLElement) => {
    const left = () => all(block(box), "p").find((each) => each.textContent.includes("signal"));
    await settled(() => left() !== undefined);
    return left()?.textContent;
  };

  it("counts the signals left: worlds seen under a week ago that this reader has not visited", async () => {
    const now = Date.now();
    const ago = (days: number) => new Date(now - days * DAY).toISOString();
    seen.file.mockReturnValue([
      world("new", ago(1)),
      world("visited", ago(1)),
      world("old", ago(30)),
      world("unknown", null),
    ]);
    localStorage.setItem(visitKey(universe.id, "visited"), "1");
    const { box } = await mountInStore(<Page />);
    await openIt(box);
    expect(await signals(box)).toBe("1 signal left to find");
  });

  it("says signals in the plural, and when none is left", async () => {
    const recent = new Date(Date.now() - DAY).toISOString();
    seen.file.mockReturnValue([world("a", recent), world("b", recent)]);
    const { box } = await mountInStore(<Page />);
    await openIt(box);
    expect(await signals(box)).toBe("2 signals left to find");
    click(button(box, "Close"));
    seen.file.mockReturnValue([world("a", null)]);
    click(button(box, "Search"));
    await settled(() => isOpen(box));
    expect(await signals(box)).toBe("No signal left to find");
  });

  it("says no signal until the worlds' file has come", async () => {
    const { box } = await mountInStore(<Page />);
    await openIt(box);
    expect(block(box).textContent).not.toContain("signal");
  });

  it("opens the passport over the page and closes the drawer", async () => {
    const { box } = await mountInStore(<Page />);
    await openIt(box);
    click(button(box, "Open your passport"));
    expect(isOpen(box)).toBe(false);
    expect(at(box)).toMatch(/#passport$/);
  });

  it("goes explore from the drawer, to the world the server names, closing it with the page", async () => {
    seen.explore.mockResolvedValue("/w/govdao");
    const { box } = await mountInStore(<Page />);
    await openIt(box);
    await act(async () => {
      nth(all(block(box), "a"), 0).click();
      await vi.dynamicImportSettled();
    });
    await settled(() => at(box) === "/w/govdao");
    expect(isOpen(box)).toBe(false);
  });
});

// The search drawer opened from outside the header (F5462, 8n): a full Plan's "+N" asks it, as an event, open on the namespace's words;
// each ask starts from its own words, and its button and chord open on none (G3).
describe("the search drawer asked from the page", () => {
  const ask = (detail: unknown) => {
    act(() => {
      window.dispatchEvent(new CustomEvent(SEARCH, { detail }));
    });
  };

  it("opens on the words it is asked, each time on its own", async () => {
    const { box } = await mountInStore(<Page />);
    ask("gnoswap");
    await settled(() => isOpen(box));
    expect(field(box)).toHaveProperty("value", "gnoswap");
    ask("samcrew");
    await settled(() => (field(box) as HTMLInputElement).value === "samcrew");
    expect(field(box)).toHaveProperty("value", "samcrew");
  });

  it("takes no words that are not text", async () => {
    const { box } = await mountInStore(<Page />);
    ask({ evil: true });
    await settled(() => isOpen(box));
    expect(field(box)).toHaveProperty("value", "");
  });

  it("opens on no words from its button after a Plan asked it on its own", async () => {
    const { box } = await mountInStore(<Page />);
    ask("gnoswap");
    await settled(() => (field(box) as HTMLInputElement).value === "gnoswap");
    expect(await reopened(box)).toHaveProperty("value", "");
  });
});
