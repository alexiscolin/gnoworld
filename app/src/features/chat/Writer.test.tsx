// @vitest-environment jsdom
import { Address } from "@gnoworld/schemas";
import type { Line } from "@gnoworld/core";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { roomActs } from "./roomActs.ts";
import { shownOf } from "./shown.tsx";
import "./Thread.tsx";
import { useThreads } from "./Threading.tsx";

// R2 (redpass2-4th): the thread's composer is a lazy chunk like the panel's. One that could not be fetched is the panel's
// failure alone, and the next thread opened asks for it again: a lazy component would keep its failure for good.
const ALICE = Address.parse("g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv");
const fetched = vi.hoisted(() => ({ count: 0 }));
vi.mock("./Composer.tsx", async (original) => {
  fetched.count += 1;
  if (fetched.count === 1) throw new Error("chunk could not be fetched");
  return original();
});

const LINES: Line[] = [{ id: "root" }].map((each) => ({
  time: "2026-10-25T10:00:00.000Z",
  from: ALICE,
  account: ALICE,
  text: each.id,
  kind: "message",
  ...each,
}));
const acts = roomActs({ current: undefined }, "", () => undefined);
const STATE = {
  lines: LINES,
  members: [ALICE],
  topic: undefined,
  refused: undefined,
  typing: undefined,
  read: undefined,
};
const shown = shownOf(
  { partner: undefined, nav: undefined, lines: LINES, empty: "", refused: undefined, problem: undefined },
  { id: "#bubble/games", state: STATE, acts },
  { sayTo: () => true, focus: false, noteId: "note" },
);
function Page() {
  const { view, aside } = useThreads({
    shown,
    state: STATE,
    session: { kind: "in", address: ALICE },
    rooms: [],
    acts,
  });
  return (
    <div>
      <button
        id="open"
        type="button"
        onClick={() => {
          view.onThread?.("root");
        }}
      />
      {aside}
    </div>
  );
}
const field = () => document.querySelector("aside input[type='text'], aside textarea");
// Until the field is there, or what the page shows has stood still for a while.
async function settle(until: () => boolean = () => false) {
  for (let waits = 0; waits < 100 && !until(); waits++)
    await act(async () => {
      await new Promise((done) => setTimeout(done, 10));
    });
}

beforeEach(() => {
  // jsdom has no matchMedia, which the composer reads for a touch screen: a computer's pointer.
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  Object.assign(HTMLElement.prototype, { togglePopover: () => true });
});
afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

it("says it could not open the thread when the composer's code cannot be fetched, and asks again for the next", async () => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  const root = createRoot(document.body.appendChild(document.createElement("div")));
  act(() => {
    root.render(<Page />);
  });
  act(() => {
    document.querySelector<HTMLElement>("#open")?.click();
  });
  await settle(() => document.body.textContent.includes("Could not open"));
  expect(document.body.textContent).toContain("Could not open the thread");
  expect(field()).toBeNull();
  act(() => {
    document.querySelector<HTMLElement>("aside button")?.click();
  });
  expect(document.querySelector("aside[aria-label='Thread']")).toBeNull();
  act(() => {
    document.querySelector<HTMLElement>("#open")?.click();
  });
  await settle(() => field() !== null);
  expect(field()).not.toBeNull();
  act(() => {
    root.unmount();
  });
});
