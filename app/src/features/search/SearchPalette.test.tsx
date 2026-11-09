// @vitest-environment jsdom
import { act } from "react";
import { useLocation, useNavigate } from "react-router";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { mountInStore } from "../../../tests/inStore.tsx";
import { all, button, click, modals, nth, one, settled } from "../../../tests/mount.tsx";
import { site } from "../../places.ts";
import { SEARCH } from "../../space/openEvent.ts";
import { SearchButton, SearchPalette } from "./SearchPalette.tsx";

// The search palette (D355): opened by its button, the chord, the slash and an event, closed four ways, its groups, ranking, prefixes,
// chips, preview and keys. Where the browser's own focus, top layer and Esc are needed, the journeys walk it.
vi.mock("../../topPill.tsx", () => import("../../../tests/pills.ts"));
const seen = vi.hoisted(() => ({
  file: vi.fn<() => unknown>(),
  here: vi.fn<() => Promise<unknown>>(),
  explore: vi.fn<() => Promise<string>>(),
}));
vi.mock("../../worldsFile.ts", () => ({ useWorldsFile: seen.file }));
vi.mock("../../lib/api/presence.ts", () => ({ pagePresenceApi: () => ({ read: seen.here }) }));
vi.mock("../home/explore.ts", () => ({ exploreTo: seen.explore }));

// What the file always gives a realm, which the Discover shelves read.
const BARE = { functions: [], imports: [], deployerName: null, callers: 0, lastHeight: null };
const universe = site.universeAt("/");

function Page() {
  const { pathname, hash } = useLocation();
  const navigate = useNavigate();
  return (
    <>
      <SearchButton className="" emphasis="outline" />
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

const drawerOf = (box: HTMLElement) => box.querySelector<HTMLDialogElement>("dialog");
const isOpen = (box: HTMLElement) => drawerOf(box)?.open ?? false;
const at = (box: HTMLElement) => one(box, "[data-at]").textContent;
const field = (box: HTMLElement) => one(box, "input[type='search']");
const rows = (box: HTMLElement) => all(box, "[role='option']");
const labels = (box: HTMLElement) => rows(box).map((each) => each.querySelector("[class*='name']")?.textContent);
const groups = (box: HTMLElement) => all(box, "[role='group'] .label").map((each) => each.textContent);
const active = (box: HTMLElement) => rows(box).findIndex((each) => each.getAttribute("aria-selected") === "true");
const preview = (box: HTMLElement) => one(box, "section[aria-label='Preview']");

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
const press = (target: Element, key: string, over: KeyboardEventInit = {}) => {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...over });
  act(() => {
    target.dispatchEvent(event);
  });
  return event;
};
const chord = (over: KeyboardEventInit) => {
  const event = new KeyboardEvent("keydown", { key: "k", bubbles: true, cancelable: true, ...over });
  act(() => {
    document.dispatchEvent(event);
  });
  return event;
};

const reported = vi.fn();
beforeAll(() => {
  modals();
  Element.prototype.scrollIntoView = vi.fn();
});
beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("reportError", reported);
  seen.file.mockReturnValue(undefined);
  seen.here.mockResolvedValue({ ok: true, value: { worlds: [{ world: "bubble", here: 7 }] } });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  expect(reported).not.toHaveBeenCalled();
});

describe("opening the palette", () => {
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

  it("opens by the slash, but a slash typed in a field is a slash", async () => {
    const { box } = await mountInStore(
      <>
        <Page />
        <input aria-label="Elsewhere" />
      </>,
    );
    const elsewhere = one(box, "input[aria-label='Elsewhere']");
    expect(press(elsewhere, "/").defaultPrevented).toBe(false);
    expect(drawerOf(box)).toBeNull();
    expect(press(document.body, "/").defaultPrevented).toBe(true);
    await settled(() => isOpen(box));
  });

  it("keeps a dialog already open: the chord opens no second one", async () => {
    const { box } = await mountInStore(
      <>
        <Page />
        <dialog open aria-label="Another" />
      </>,
    );
    expect(chord({ metaKey: true }).defaultPrevented).toBe(true);
    expect(all(box, "dialog")).toHaveLength(1);
  });
});

describe("closing the palette", () => {
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

  it("closes by Escape in the field, which holds words: the search field's own Escape would only clear them", async () => {
    const { box } = await mountInStore(<Page />);
    await openIt(box);
    type(field(box), "zzz");
    press(field(box), "Escape");
    expect(isOpen(box)).toBe(false);
  });

  it("closes by Close", async () => {
    const { box } = await mountInStore(<Page />);
    await openIt(box);
    click(button(box, "Close"));
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
  it("opens on Discover, not on a list of places, and holds that list back till words are typed", async () => {
    const { box } = await mountInStore(<Page />);
    await openIt(box);
    expect(box.textContent).toContain("Reading the realms");
    expect(rows(box)).toHaveLength(0);
    expect(groups(box)).toEqual([]);
  });

  it("ranks one list by the name typed, with a typo forgiven", async () => {
    const { box } = await mountInStore(<Page />);
    await openIt(box);
    type(field(box), "bub");
    expect(labels(box)[0]).toBe("Bubble");
    expect(groups(box)).toEqual([]);
    type(field(box), "bubbel");
    expect(labels(box)).toContain("Bubble");
  });

  it("says so for a query none holds, and for an address, which no page holds", async () => {
    const { box } = await mountInStore(<Page />);
    await openIt(box);
    type(field(box), "zzzz-nothing");
    expect(rows(box)).toHaveLength(0);
    expect(box.textContent).toContain("No place answers");
    type(field(box), `g1${"q".repeat(38)}`);
    expect(box.textContent).toContain("No page holds an address yet.");
  });

  it("shows the people in a world beside it, from the server's presence", async () => {
    const { box } = await mountInStore(<Page />);
    await openIt(box);
    type(field(box), "bub");
    const bubble = rows(box).find((each) => each.textContent.includes("Bubble"));
    await settled(() => bubble?.textContent.includes("7 here") ?? false);
    expect(bubble?.textContent).toContain("7 here");
  });

  it("shows no count when the server says nothing", async () => {
    seen.here.mockResolvedValue({ ok: false });
    const { box } = await mountInStore(<Page />);
    await openIt(box);
    type(field(box), "bub");
    await act(async () => {
      await Promise.resolve();
    });
    expect(rows(box).find((each) => each.textContent.includes("Bubble"))?.textContent).not.toContain("here");
  });

  it("goes to a place chosen by a click, closes, and keeps it as the recent one", async () => {
    const { box } = await mountInStore(<Page />);
    await openIt(box);
    type(field(box), "bub");
    click(rows(box).find((each) => each.textContent.includes("Bubble")));
    await settled(() => at(box) === "/w/bubble");
    expect(isOpen(box)).toBe(false);
    expect(localStorage.getItem("gnoworld:recent-places")).toBe("/w/bubble");
  });
});

describe("the prefixes", () => {
  it("# finds a room and its place, @ a system and the realms of a namespace, /r/ a realm, from the worlds' file", async () => {
    seen.file.mockReturnValue([
      {
        id: "gnoswap/router",
        namespace: "gnoswap",
        realms: [{ path: "gno.land/r/gnoswap/v1/router", ...BARE }],
        seen: null,
      },
    ]);
    const { box } = await mountInStore(<Page />);
    await openIt(box);
    type(field(box), "#bubb");
    expect(rows(box).map((each) => each.textContent)).toEqual([expect.stringContaining("#bubble · room")]);
    type(field(box), "@gnoswap");
    expect(labels(box)).toEqual(["gnoswap", "gnoswap/v1/router"]);
    type(field(box), "/r/gnoswap/v1/router");
    expect(labels(box)).toEqual(["gnoswap/v1/router"]);
  });

  it("> lists the commands, and > earth goes to the Earth", async () => {
    const { box } = await mountInStore(<Page />);
    await openIt(box);
    type(field(box), ">");
    expect(labels(box)).toEqual(["earth", "universe", "plan", "explore"]);
    type(field(box), "> earth");
    press(field(box), "Enter");
    await settled(() => at(box) === universe.earth.path);
    expect(isOpen(box)).toBe(false);
  });

  it("> explore goes where the server names", async () => {
    seen.explore.mockResolvedValue("/w/govdao");
    const { box } = await mountInStore(<Page />);
    await openIt(box);
    type(field(box), "> explore");
    await act(async () => {
      press(field(box), "Enter");
      await vi.dynamicImportSettled();
    });
    await settled(() => at(box) === "/w/govdao");
    expect(isOpen(box)).toBe(false);
  });
});

describe("a long list", () => {
  const many = Array.from({ length: 60 }, (_, n) => ({
    id: `big/realm${String(n)}`,
    namespace: n < 30 ? "big" : "small",
    realms: [{ path: `gno.land/r/big/realm${String(n)}`, calls: n, ...BARE }],
    seen: null,
  }));

  it("draws the best 50 and says how many more answered", async () => {
    seen.file.mockReturnValue(many);
    const { box } = await mountInStore(<Page />);
    await openIt(box);
    type(field(box), "/r/realm");
    expect(rows(box)).toHaveLength(50);
    expect(box.textContent).toContain("10 more · refine");
  });

  it("narrows to a namespace by its chip, the busiest offered, and orders by the sort", async () => {
    seen.file.mockReturnValue(many);
    const { box } = await mountInStore(<Page />);
    await openIt(box);
    type(field(box), "@");
    click(button(box, "@big"));
    type(field(box), "/r/realm");
    expect(rows(box)).toHaveLength(30);
    expect(box.textContent).not.toContain("more · refine");
    const sort = one(box, "select[aria-label='Sort by']") as HTMLSelectElement;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set?.call(sort, "name");
      sort.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(labels(box)[0]).toBe("big/realm0");
  });
});

describe("the namespace chips", () => {
  const file = [
    { id: "big/a", namespace: "big", realms: [{ path: "gno.land/r/big/a", calls: 5, ...BARE }], seen: null },
  ];

  it("show only while the field starts with @, where they help", async () => {
    seen.file.mockReturnValue(file);
    const { box } = await mountInStore(<Page />);
    await openIt(box);
    expect(button(box, "@big")).toBeUndefined();
    type(field(box), "gno");
    expect(button(box, "@big")).toBeUndefined();
    type(field(box), "@");
    expect(button(box, "@big")).toBeDefined();
  });
});

describe("the chips", () => {
  it("narrow the list, one pressed at a time, and press again to clear", async () => {
    const { box } = await mountInStore(<Page />);
    await openIt(box);
    type(field(box), "e");
    const all_ = rows(box).length;
    click(button(box, "People here"));
    await settled(() => rows(box).some((each) => each.textContent.includes("Bubble")));
    expect(rows(box).length).toBeLessThan(all_);
    expect(button(box, "People here")?.getAttribute("aria-pressed")).toBe("true");
    click(button(box, "People here"));
    expect(rows(box)).toHaveLength(all_);
  });
});

describe("the keys and the preview", () => {
  it("↑↓ choose round the ends, and the preview follows the chosen place", async () => {
    const { box } = await mountInStore(<Page />);
    await openIt(box);
    type(field(box), "bub");
    expect(active(box)).toBe(0);
    expect(preview(box).textContent).toContain("Bubble");
    press(field(box), "ArrowUp");
    expect(active(box)).toBe(rows(box).length - 1);
    press(field(box), "ArrowDown");
    expect(active(box)).toBe(0);
  });

  it("shows the preview's kind, description, rooms and actions", async () => {
    const { box } = await mountInStore(<Page />);
    await openIt(box);
    type(field(box), "bubble");
    const shown = preview(box).textContent;
    expect(shown).toContain("#bubble");
    // The keys are for a screen reader (aria-keyshortcuts), never drawn on the buttons.
    const keys = (name: string) => button(preview(box), name)?.getAttribute("aria-keyshortcuts");
    expect(keys("Go")).toBe("Enter");
    expect(keys("Chat")).toBe("Shift+Enter");
    expect(shown).toContain("Copy link");
  });

  it("Enter goes to the chosen place", async () => {
    const { box } = await mountInStore(<Page />);
    await openIt(box);
    type(field(box), "bubble");
    press(field(box), "Enter");
    await settled(() => at(box) === "/w/bubble");
    expect(isOpen(box)).toBe(false);
  });

  it("Shift+Enter goes to a world's own page, where its chat is docked, and from the universe to its Earth", async () => {
    const { box } = await mountInStore(<Page />);
    await openIt(box);
    type(field(box), "bubble");
    press(field(box), "Enter", { shiftKey: true });
    await settled(() => at(box) === "/w/bubble");
    click(button(box, "Leave"));
    await openIt(box);
    type(field(box), universe.name);
    press(field(box), "Enter", { shiftKey: true });
    await settled(() => at(box) === universe.earth.path);
    expect(isOpen(box)).toBe(false);
  });

  it("⌘C copies the chosen place's link, but leaves a selection in the field alone", async () => {
    const write = vi.fn(() => Promise.resolve());
    vi.stubGlobal("navigator", { clipboard: { writeText: write } });
    const { box } = await mountInStore(<Page />);
    await openIt(box);
    type(field(box), "bubble");
    expect(press(field(box), "c", { metaKey: true }).defaultPrevented).toBe(true);
    expect(write).toHaveBeenCalledWith(`${location.origin}/w/bubble`);
    const input = field(box) as HTMLInputElement;
    input.setSelectionRange(0, 3);
    expect(press(input, "c", { metaKey: true }).defaultPrevented).toBe(false);
  });
});

describe("the palette asked from the page", () => {
  const ask = (detail: unknown) => {
    act(() => {
      window.dispatchEvent(new CustomEvent(SEARCH, { detail }));
    });
  };

  it("opens on the namespace it is asked, each time on its own", async () => {
    const { box } = await mountInStore(<Page />);
    ask("gnoswap");
    await settled(() => isOpen(box));
    expect(field(box)).toHaveProperty("value", "@gnoswap");
    ask("samcrew");
    await settled(() => (field(box) as HTMLInputElement).value === "@samcrew");
  });

  it("opens on the empty field for the rail's tab, and for no words that are not text", async () => {
    const { box } = await mountInStore(<Page />);
    ask("");
    await settled(() => isOpen(box));
    expect(field(box)).toHaveProperty("value", "");
    ask({ evil: true });
    expect(field(box)).toHaveProperty("value", "");
  });

  it("opens on no words from its button after a Plan asked it on its own", async () => {
    const { box } = await mountInStore(<Page />);
    ask("gnoswap");
    await settled(() => (field(box) as HTMLInputElement).value === "@gnoswap");
    expect(await reopened(box)).toHaveProperty("value", "");
  });
});
