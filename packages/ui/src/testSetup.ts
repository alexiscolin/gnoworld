// Each test starts on an empty page: without Vitest's globals, Testing Library cleans up only when told.
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(cleanup);

// jsdom draws no top layer and has no showModal: a dialog it opens is open, and closed by close(),
// which says so with its close event, as the browser does. Its focus, Esc and scrim are the stories'
// journeys' (docs/plans/slice-2cd.md).
Object.assign(HTMLDialogElement.prototype, {
  showModal(this: HTMLDialogElement) {
    this.open = true;
  },
  close(this: HTMLDialogElement) {
    if (!this.open) return;
    this.open = false;
    this.dispatchEvent(new Event("close"));
  },
});

// jsdom has no popover API, and its sheet hides every [popover]: a stand-in shows one by its trigger or its
// methods, as Chromium 156 does: beforetoggle at once, toggle a later task, one for changes in a row (F924).
// Light dismiss, Esc and the top layer are the journeys'.
function popovers() {
  const queued = new WeakMap<HTMLElement, { oldState: string; newState: string }>();
  const toggled = (element: HTMLElement, open: boolean) => {
    const was = element.style.display === "block";
    if (was === open) return;
    const states = { oldState: was ? "open" : "closed", newState: open ? "open" : "closed" };
    element.dispatchEvent(Object.assign(new Event("beforetoggle"), states));
    element.style.display = open ? "block" : "";
    const waiting = queued.get(element);
    if (waiting !== undefined) {
      waiting.newState = states.newState;
      return;
    }
    queued.set(element, states);
    setTimeout(() => {
      queued.delete(element);
      element.dispatchEvent(Object.assign(new Event("toggle"), states));
    });
  };
  return {
    showPopover(this: HTMLElement) {
      toggled(this, true);
    },
    hidePopover(this: HTMLElement) {
      toggled(this, false);
    },
    togglePopover(this: HTMLElement, force?: boolean) {
      toggled(this, force ?? this.style.display !== "block");
    },
  };
}

Object.assign(HTMLElement.prototype, popovers());

document.addEventListener("click", (event) => {
  const trigger = event.target instanceof Element ? event.target.closest("[popovertarget]") : null;
  const panel = document.getElementById(trigger?.getAttribute("popovertarget") ?? "");
  panel?.togglePopover();
});

// jsdom has no matchMedia: every query answers no, so motion that waits for "no-preference" stays still.
Object.assign(window, { matchMedia: (media: string) => ({ matches: false, media }) });
