// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import type { ShownLine } from "@gnoworld/core";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { all, mount, noMedia, one } from "../../../../tests/mount.tsx";
import { Head, openAuthorCard } from "./LineHead.tsx";

// View profile: the More menu's item opens the card of the line's author, whose name is the pointer's way and no Tab stop; the focus
// goes to the name, which the card gives back as it closes.
const ALICE = "g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv";
const GUEST: ShownLine = {
  id: "m2",
  time: "2026-11-05T10:00:00.000Z",
  from: "guest-ab12cd",
  text: "hi",
  kind: "message",
};
const ACCOUNT: ShownLine = { ...GUEST, id: "m1", from: ALICE, account: ALICE };

beforeEach(() => {
  noMedia();
});
afterEach(() => {
  vi.unstubAllGlobals();
});
function drawn(shown: ShownLine) {
  return mount(
    <MemoryRouter>
      <ul>
        <li>
          <Head line={shown} mine={false} me={undefined} mentioned={false} saved={false} pinned={false} />
          <button type="button" data-more>
            More actions
          </button>
        </li>
      </ul>
    </MemoryRouter>,
  );
}
const nameOf = (box: HTMLElement) => one(box, "[data-author] > button");

describe("a line's author name", () => {
  it("is a button for an account and for a guest, and takes no Tab stop", () => {
    for (const shown of [ACCOUNT, GUEST]) {
      const box = drawn(shown);
      expect(nameOf(box).tabIndex).toBe(-1);
      box.remove();
    }
  });

  it("takes the focus and is pressed as View profile acts from the line's menu", () => {
    const box = drawn(ACCOUNT);
    const pressed = vi.fn();
    nameOf(box).addEventListener("click", pressed);
    one(box, "[data-more]").focus();
    expect(document.activeElement).toBe(one(box, "[data-more]"));
    openAuthorCard();
    expect(document.activeElement).toBe(nameOf(box));
    expect(pressed).toHaveBeenCalledOnce();
  });

  it("opens no card of another line, and does nothing with the focus outside a line", () => {
    const box = drawn(ACCOUNT);
    const outside = document.createElement("input");
    document.body.append(outside);
    outside.focus();
    const pressed = vi.fn();
    nameOf(box).addEventListener("click", pressed);
    openAuthorCard();
    expect(pressed).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(outside);
    outside.remove();
    expect(all(box, "[data-author] > button")).toHaveLength(1);
  });
});

// A phone's name box grows upward only (under the name stands the line's first row). utilities.css gives every bare button a symmetric
// 44 px box, and the layer order (components, then utilities) lets it beat any rule of the components layer whatever its specificity:
// the author's box must sit in the utilities layer, on a selector one class and one attribute above the generic rule's (specificity 0,3,2 against 0,2,2).
describe("the author's tap box on a phone", () => {
  const sheet = readFileSync(`.${new URL("./RoomView.module.css", import.meta.url).pathname}`, "utf8");
  const generic = ':is(.hit, button.bare):not([data-stretch], [data-emphasis="link"])::after';

  it("outranks the generic bare-button box and grows upward only", () => {
    const own =
      /@layer utilities \{\s*@media \(width < 900px\) \{\s*\.author button\[type\]\[aria-haspopup\]::after \{([^}]*)\}/;
    expect(own.exec(sheet)?.[1]).toMatch(/inset-block: calc\(1lh - var\(--control-m\)\) 0;/);
    expect(readFileSync("packages/ui/src/utilities.css", "utf8")).toContain(generic);
  });
});
