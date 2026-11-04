// The cosmos's labels as doors (ADR-0003 §2, 2b and 2e): a world's label opens to "Enter →" under the pointer, at a first tap, or while the
// keyboard is on that world's link in the rail or the list, for the labels take no focus; a click, or a second tap, goes to its page through
// the page's router. The Earth's label is a call already, "Start here" to a newcomer: one click or one tap enters. The labels are the scene's
// (scene/cosmos/labels.ts): only the world each one names is read.
import { EARTH } from "@gnoworld/core";
import type { CosmosWorld } from "../../scene/cosmos/cosmosWorld.ts";
import { followed } from "../../lib/followed.ts";
import styles from "./labelDoors.module.css";
import { pagesOf, type WorldPlaces } from "../../lib/hubWorld.ts";
import type { Known } from "./worldsFeed.ts";

/** What the doors need of the page: the places its labels lead to, and its router. */
export interface DoorsPage {
  readonly places: WorldPlaces;
  readonly open: (href: string) => void;
}

const LABEL = "[data-labels] [data-world]";
const OPEN = styles["open"] ?? "open";
const DOOR = styles["door"] ?? "door";
// The Earth's label names its place already, "Start here" to a newcomer: it enters at once, and never opens to Enter.
const direct = (label: HTMLElement) => label.dataset["world"] === EARTH;

const labelAt = (target: EventTarget | null): HTMLElement | undefined => {
  const label = target instanceof Element ? target.closest(LABEL) : null;
  return label instanceof HTMLElement ? label : undefined;
};

// A link's page, as the pages name them: no query, no last slash.
const pageOfLink = (target: EventTarget | null): string | undefined =>
  target instanceof HTMLAnchorElement && target.href !== ""
    ? new URL(target.href).pathname.replace(/(.)\/$/, "$1")
    : undefined;

/** Makes the labels doors while `signal` lasts: the worlds' pages as `known` gives them, the hubs' and the Earth's before its file came. */
export function labelDoors(page: DoorsPage, known: () => Known | undefined, signal: AbortSignal): void {
  // ponytail: two passes over the file's worlds each time the feed gives another, 20,000 at most, read at an event, never on a frame.
  let held: { worlds: readonly CosmosWorld[]; pages: Map<string, string>; byPage: Map<string, string> } | undefined;
  const heldNow = () => {
    const worlds = known()?.worlds ?? [];
    if (held?.worlds !== worlds) {
      const pages = pagesOf(worlds, page.places);
      held = { worlds, pages, byPage: new Map([...pages].map(([world, href]) => [href, world])) };
    }
    return held;
  };
  const hrefOf = (label: HTMLElement) => heldNow().pages.get(label.dataset["world"] ?? "");
  const worldAt = (href: string) => heldNow().byPage.get(href);
  // Each open label, by the world it named as it opened.
  const opened = new Map<HTMLElement, string | undefined>();
  const close = (label?: HTMLElement) => {
    for (const each of label === undefined ? [...opened.keys()] : [label]) {
      each.classList.remove(OPEN);
      each.style.removeProperty("--_open");
      opened.delete(each);
    }
  };
  // A label that comes to name another world while open closes: the labels' pool reuses its elements, and writes the same world again.
  const watching = new MutationObserver((changes) => {
    for (const { target } of changes)
      if (target instanceof HTMLElement && opened.has(target) && opened.get(target) !== target.dataset["world"])
        close(target);
  });
  signal.addEventListener("abort", () => {
    watching.disconnect();
    close();
    for (const label of document.querySelectorAll(LABEL)) label.classList.remove(DOOR);
  });
  const openOne = (label: HTMLElement) => {
    if (opened.has(label)) return;
    close();
    if (direct(label) || hrefOf(label) === undefined) return;
    const before = label.getBoundingClientRect();
    label.classList.add(OPEN);
    opened.set(label, label.dataset["world"]);
    watching.observe(label, { attributes: true, attributeFilter: ["data-world"] });
    // "Enter →" grows the label past the room the layout kept to its right: it grows to its left instead, as far as the window lets it.
    const shift = Math.min(label.getBoundingClientRect().width - before.width, before.left);
    if (shift > 0) label.style.setProperty("--_open", `${String(-shift)}px`);
  };
  // A label shows the pointer's hand only where it leads somewhere: a hand-made project's has no page here (F4649).
  const marked = (label: HTMLElement) => label.classList.toggle(DOOR, hrefOf(label) !== undefined);
  hearPointer({ openOne, close, hrefOf, marked, open: page.open }, signal);
  hearFocus({ openOne, close, worldAt }, signal);
}

interface Doors {
  readonly openOne: (label: HTMLElement) => void;
  readonly marked: (label: HTMLElement) => void;
  readonly close: (label?: HTMLElement) => void;
  readonly hrefOf: (label: HTMLElement) => string | undefined;
  readonly open: (href: string) => void;
}

// The pointer and the finger: hover opens, a click enters; a first tap opens, a second enters, a tap elsewhere closes.
function hearPointer({ openOne, close, hrefOf, marked, open }: Doors, signal: AbortSignal): void {
  const listening = { signal };
  let finger = false;
  document.addEventListener(
    "pointerover",
    ({ target, pointerType }) => {
      const label = labelAt(target);
      if (label !== undefined) marked(label);
      if (label !== undefined && pointerType !== "touch") openOne(label);
    },
    listening,
  );
  document.addEventListener(
    "pointerout",
    ({ target, relatedTarget, pointerType }) => {
      const label = labelAt(target);
      if (label !== undefined && pointerType !== "touch" && labelAt(relatedTarget) !== label) close(label);
    },
    listening,
  );
  document.addEventListener(
    "pointerdown",
    ({ pointerType }) => {
      finger = pointerType === "touch";
    },
    listening,
  );
  document.addEventListener(
    "click",
    (event) => {
      const label = labelAt(event.target);
      const href = label === undefined ? undefined : hrefOf(label);
      const tapped = finger;
      finger = false;
      if (label === undefined || href === undefined) {
        if (tapped) close();
        return;
      }
      if (tapped && !direct(label) && !label.classList.contains(OPEN)) {
        event.preventDefault();
        openOne(label);
        return;
      }
      close();
      followed(event, href, open);
    },
    listening,
  );
}

// The keyboard: a world's label opens while the focus is on that world's link, and closes as it leaves.
function hearFocus(
  {
    openOne,
    close,
    worldAt,
  }: Pick<Doors, "openOne" | "close"> & { readonly worldAt: (href: string) => string | undefined },
  signal: AbortSignal,
): void {
  document.addEventListener(
    "focusin",
    ({ target }) => {
      const at = pageOfLink(target);
      const world = at === undefined ? undefined : worldAt(at);
      const label = [...document.querySelectorAll<HTMLElement>(LABEL)].find((each) => each.dataset["world"] === world);
      if (world === undefined || label === undefined) close();
      else openOne(label);
    },
    { signal },
  );
  document.addEventListener(
    "focusout",
    ({ relatedTarget }) => {
      if (relatedTarget === null) close();
    },
    { signal },
  );
}
