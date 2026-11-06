// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CosmosWorld, LabelSignals } from "../../scene/cosmos/cosmosWorld.ts";
import { labelDoors } from "./labelDoors.ts";
import styles from "./labelDoors.module.css";
import type { Known } from "./worldsFeed.ts";

// The cosmos's labels as doors (ADR-0003 §2, 2b and 2e): a world's label opens to "Enter →" under the pointer, at a first tap, or while the
// keyboard is on that world's link; a click, or a second tap, goes to its page. The Earth's label is a call already: one click or one tap
// enters. Only the world each label of the scene's layer names is read here.
const PLACES = {
  earth: "/earth",
  worlds: [{ slug: "govdao", path: "/w/govdao", realms: ["gno.land/r/gov/dao"] }],
};
const world = (id: string): CosmosWorld => ({
  id,
  namespace: id.split("/")[0] ?? id,
  realms: [{ callers: 1, path: `gno.land/r/${id}` }],
});
const SIGNALS: LabelSignals = { present: new Map(), names: new Map(), visited: () => false, now: 0 };
const KNOWN: Known = { worlds: [world("gov/dao"), world("games/go")], signals: SIGNALS };

let leaving: AbortController;
let open: ReturnType<typeof vi.fn<(href: string) => void>>;

function layer(...labels: { world: string }[]) {
  const box = document.createElement("div");
  box.dataset["labels"] = "";
  box.setAttribute("aria-hidden", "true");
  for (const { world: id } of labels) {
    const label = document.createElement("div");
    label.dataset["world"] = id;
    label.style.setProperty("pointer-events", "auto");
    label.append(Object.assign(document.createElement("span"), { textContent: id }));
    box.append(label);
  }
  document.body.append(box);
  return box;
}
const labelOf = (id: string) => {
  const found = document.querySelector<HTMLElement>(`[data-labels] [data-world="${id}"]`);
  if (found === null) throw new Error(`no label of ${id}`);
  return found;
};
const words = (id: string) => labelOf(id).querySelector("span") ?? labelOf(id);
// The doors' open class, their stylesheet's, and the one of a label that leads somewhere.
const OPEN = styles["open"] ?? "open";
const DOOR = styles["door"] ?? "door";
const opened = () =>
  [...document.querySelectorAll<HTMLElement>("[data-labels] [data-world]")]
    .filter((one) => one.classList.contains(OPEN))
    .map((one) => one.dataset["world"]);
const pointer = (type: string, at: Element, init: PointerEventInit = {}) =>
  at.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerType: "mouse", ...init }));
// A finger's whole sequence, as a touch browser sends it: over, down, up, out, then the click (F4500).
const tap = (at: Element) => {
  pointer("pointerover", at, { pointerType: "touch" });
  pointer("pointerdown", at, { pointerType: "touch" });
  pointer("pointerup", at, { pointerType: "touch" });
  pointer("pointerout", at, { pointerType: "touch", relatedTarget: document.body });
  return at.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
};
const clickAt = (at: Element, keys: MouseEventInit = {}) => {
  pointer("pointerdown", at);
  return at.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, ...keys }));
};

beforeEach(() => {
  leaving = new AbortController();
  open = vi.fn<(href: string) => void>();
});
afterEach(() => {
  leaving.abort();
  document.body.replaceChildren();
});

describe("a label under the pointer", () => {
  // F4649: a label with no page, a hand-made project's (7v's ~earth/gnosh.ai), looked like a door and opened nothing: only a door shows the
  // pointer's hand, and none stays once the doors are gone.
  it("marks a label that leads somewhere as a door under the pointer, and none with no page", () => {
    layer({ world: "gov/dao" }, { world: "~earth/gnosh.ai" });
    labelDoors({ places: PLACES, open }, () => KNOWN, leaving.signal);
    pointer("pointerover", words("gov/dao"));
    pointer("pointerover", words("~earth/gnosh.ai"));
    expect(labelOf("gov/dao").classList.contains(DOOR)).toBe(true);
    expect(labelOf("~earth/gnosh.ai").classList.contains(DOOR)).toBe(false);
    leaving.abort();
    expect(labelOf("gov/dao").classList.contains(DOOR)).toBe(false);
  });

  it("opens to Enter while the pointer is on it, and closes as it leaves", () => {
    layer({ world: "gov/dao" }, { world: "games/go" });
    labelDoors({ places: PLACES, open }, () => KNOWN, leaving.signal);
    pointer("pointerover", words("gov/dao"));
    expect(opened()).toEqual(["gov/dao"]);
    pointer("pointerout", words("gov/dao"), { relatedTarget: labelOf("gov/dao") });
    expect(opened()).toEqual(["gov/dao"]);
    pointer("pointerout", labelOf("gov/dao"), { relatedTarget: document.body });
    expect(opened()).toEqual([]);
  });

  // The pointer passes from one of the label's words to another: the label stays open, never closed and opened again.
  it("keeps an open label open as the pointer passes over its words", () => {
    layer({ world: "gov/dao" });
    labelDoors({ places: PLACES, open }, () => KNOWN, leaving.signal);
    pointer("pointerover", words("gov/dao"));
    const changes: string[] = [];
    new MutationObserver((seen) => {
      for (const change of seen) changes.push(String(change.attributeName));
    }).observe(labelOf("gov/dao"), { attributes: true, attributeFilter: ["class"] });
    pointer("pointerout", words("gov/dao"), { relatedTarget: labelOf("gov/dao") });
    pointer("pointerover", labelOf("gov/dao"));
    return Promise.resolve().then(() => {
      expect(changes).toEqual([]);
      expect(opened()).toEqual(["gov/dao"]);
    });
  });

  it("goes to the world's page through the router at a click: a hub's page, or its first realm's", () => {
    layer({ world: "gov/dao" }, { world: "games/go" });
    labelDoors({ places: PLACES, open }, () => KNOWN, leaving.signal);
    expect(clickAt(words("gov/dao"))).toBe(false);
    clickAt(labelOf("games/go"));
    expect(open.mock.calls).toEqual([["/w/govdao"], ["/r/games/go"]]);
  });

  it.each([{ metaKey: true }, { ctrlKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }])(
    "leaves a click %j to the browser",
    (keys) => {
      layer({ world: "gov/dao" });
      labelDoors({ places: PLACES, open }, () => KNOWN, leaving.signal);
      clickAt(labelOf("gov/dao"), keys);
      expect(open).not.toHaveBeenCalled();
    },
  );

  it("opens no label of a world with no page, and goes nowhere from it", () => {
    layer({ world: "lost/world" });
    labelDoors({ places: PLACES, open }, () => KNOWN, leaving.signal);
    pointer("pointerover", labelOf("lost/world"));
    expect(opened()).toEqual([]);
    expect(clickAt(labelOf("lost/world"))).toBe(true);
    expect(open).not.toHaveBeenCalled();
  });

  it("reads the hubs' and the Earth's pages before the worlds' file came", () => {
    layer({ world: "gov/dao" }, { world: "earth" });
    labelDoors({ places: PLACES, open }, () => undefined, leaving.signal);
    clickAt(labelOf("gov/dao"));
    clickAt(labelOf("earth"));
    expect(open.mock.calls).toEqual([["/w/govdao"], ["/earth"]]);
  });

  it("opens no Enter on the Earth's label, a call already, and enters the Earth at its click", () => {
    layer({ world: "earth" });
    labelDoors({ places: PLACES, open }, () => KNOWN, leaving.signal);
    pointer("pointerover", labelOf("earth"));
    expect(opened()).toEqual([]);
    clickAt(labelOf("earth"));
    expect(open).toHaveBeenCalledWith("/earth");
  });

  it("does nothing for what lies outside the labels, a link included", () => {
    layer({ world: "gov/dao" });
    const outside = Object.assign(document.createElement("a"), { href: "/w/govdao" });
    document.body.append(outside);
    labelDoors({ places: PLACES, open }, () => KNOWN, leaving.signal);
    pointer("pointerover", outside);
    expect(clickAt(outside)).toBe(true);
    expect(clickAt(document.body)).toBe(true);
    expect(opened()).toEqual([]);
    expect(open).not.toHaveBeenCalled();
  });
});

describe("a label under a finger", () => {
  it("opens at a first tap and goes nowhere; enters at a second", () => {
    layer({ world: "gov/dao" });
    labelDoors({ places: PLACES, open }, () => KNOWN, leaving.signal);
    expect(tap(words("gov/dao"))).toBe(false);
    expect(opened()).toEqual(["gov/dao"]);
    expect(open).not.toHaveBeenCalled();
    tap(words("gov/dao"));
    expect(open).toHaveBeenCalledWith("/w/govdao");
  });

  it("opens one label at a time: a tap on another, or anywhere else, closes the first", () => {
    layer({ world: "gov/dao" }, { world: "games/go" });
    labelDoors({ places: PLACES, open }, () => KNOWN, leaving.signal);
    tap(labelOf("gov/dao"));
    tap(labelOf("games/go"));
    expect(opened()).toEqual(["games/go"]);
    tap(document.body);
    expect(opened()).toEqual([]);
    expect(open).not.toHaveBeenCalled();
  });

  it("enters the Earth at the first tap on its label", () => {
    layer({ world: "earth" });
    labelDoors({ places: PLACES, open }, () => KNOWN, leaving.signal);
    tap(labelOf("earth"));
    expect(open).toHaveBeenCalledWith("/earth");
  });
});

const link = (href: string) => {
  const anchor = Object.assign(document.createElement("a"), { href, textContent: href });
  document.body.append(anchor);
  return anchor;
};

describe("a label on focus", () => {
  it("opens a world's label while the keyboard is on that world's link, and closes it as the focus leaves", () => {
    layer({ world: "gov/dao" }, { world: "games/go" });
    const [govdao, games] = [link("/w/govdao"), link("/r/games/go")];
    labelDoors({ places: PLACES, open }, () => KNOWN, leaving.signal);
    govdao.focus();
    expect(opened()).toEqual(["gov/dao"]);
    games.focus();
    expect(opened()).toEqual(["games/go"]);
    games.blur();
    expect(opened()).toEqual([]);
  });

  it("reads a link's page whatever its query or its last slash, and opens nothing for the Earth's, a call already", () => {
    layer({ world: "gov/dao" }, { world: "earth" });
    const [query, slash, earth] = [link("/w/govdao?room=general"), link("/w/govdao/"), link("/earth")];
    labelDoors({ places: PLACES, open }, () => KNOWN, leaving.signal);
    query.focus();
    expect(opened()).toEqual(["gov/dao"]);
    slash.focus();
    expect(opened()).toEqual(["gov/dao"]);
    earth.focus();
    expect(opened()).toEqual([]);
  });

  it("opens nothing for a link to a place no label shows", () => {
    layer({ world: "gov/dao" });
    const list = link("/list");
    labelDoors({ places: PLACES, open }, () => KNOWN, leaving.signal);
    list.focus();
    expect(opened()).toEqual([]);
  });
});

describe("the doors' life", () => {
  it("closes a label that comes to name another world while open", async () => {
    layer({ world: "gov/dao" });
    labelDoors({ places: PLACES, open }, () => KNOWN, leaving.signal);
    pointer("pointerover", labelOf("gov/dao"));
    labelOf("gov/dao").dataset["world"] = "games/go";
    await vi.waitFor(() => {
      expect(opened()).toEqual([]);
    });
  });

  // F4521: each poll of presence writes a label's words again, its world the same: an open label stays open.
  it("keeps an open label open as its words are written again, its world the same", async () => {
    layer({ world: "gov/dao" });
    labelDoors({ places: PLACES, open }, () => KNOWN, leaving.signal);
    pointer("pointerover", labelOf("gov/dao"));
    labelOf("gov/dao").setAttribute("data-world", "gov/dao");
    await Promise.resolve();
    await new Promise((done) => setTimeout(done, 0));
    expect(opened()).toEqual(["gov/dao"]);
  });

  // F4523: an open label grows by "Enter →"; it grows to its left as far as the window lets it, so it stays where the layout kept room.
  it("grows an open label to its left as far as the window lets it, its stem kept on its body", () => {
    layer({ world: "gov/dao" }, { world: "games/go" });
    const rect = (left: number, width: number) => ({
      left,
      width,
      right: left + width,
      top: 0,
      bottom: 30,
      height: 30,
      x: left,
      y: 0,
    });
    const sized = (label: HTMLElement, left: number) => {
      label.getBoundingClientRect = () => rect(left, label.classList.contains(OPEN) ? 180 : 100) as DOMRect;
    };
    sized(labelOf("gov/dao"), 500);
    sized(labelOf("games/go"), 30);
    labelDoors({ places: PLACES, open }, () => KNOWN, leaving.signal);
    pointer("pointerover", labelOf("gov/dao"));
    expect(labelOf("gov/dao").style.getPropertyValue("--_open")).toBe("-80px");
    pointer("pointerover", labelOf("games/go"));
    expect(labelOf("gov/dao").style.getPropertyValue("--_open")).toBe("");
    expect(labelOf("games/go").style.getPropertyValue("--_open")).toBe("-30px");
  });

  // F4526: what lets an open label close.
  it("closes an open label as the cosmos leaves, and as the focus goes to a link of no world", () => {
    layer({ world: "gov/dao" });
    const [govdao, list] = [link("/w/govdao"), link("/list")];
    labelDoors({ places: PLACES, open }, () => KNOWN, leaving.signal);
    govdao.focus();
    expect(opened()).toEqual(["gov/dao"]);
    list.focus();
    expect(opened()).toEqual([]);
    govdao.focus();
    leaving.abort();
    expect(opened()).toEqual([]);
  });

  it("hears nothing once the cosmos left", () => {
    layer({ world: "gov/dao" });
    labelDoors({ places: PLACES, open }, () => KNOWN, leaving.signal);
    leaving.abort();
    pointer("pointerover", labelOf("gov/dao"));
    clickAt(labelOf("gov/dao"));
    expect(opened()).toEqual([]);
    expect(open).not.toHaveBeenCalled();
  });
});
