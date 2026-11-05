// @vitest-environment jsdom
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { all, settled } from "../../../tests/mount.tsx";
import { mountInStore, type AppStore } from "../../../tests/inStore.tsx";
import { FOLLOWS_KEPT } from "../../lib/keep/fields.ts";
import { FollowButton } from "./FollowButton.tsx";
import { worldsFollowedIn } from "./followed.ts";

// Follow (slice 8; ADR-0002 §1, Follow): a world or a person, on this device alone, the last followed first, 500 at most (the oldest
// dropped); its words say its state; a device that refuses says the change holds for this visit only.
const ALICE = "g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv";
let store: AppStore | undefined;
async function button(kind: "worlds" | "people", id: string) {
  const mounted = await mountInStore(<FollowButton kind={kind} id={id} />);
  store = mounted.store;
  const box = mounted.box;
  await settled(() => store?.getState().device.readable === true);
  return box;
}
const press = (box: HTMLElement) => {
  act(() => {
    all(box, "button")[0]?.click();
  });
};
const follows = (): unknown => JSON.parse(localStorage.getItem("gnoworld:device:follows") ?? "null");

beforeEach(() => {
  localStorage.clear();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("the Follow button", () => {
  it("follows a world, first in the list, and stops on a second press", async () => {
    localStorage.setItem("gnoworld:device:follows", JSON.stringify({ worlds: ["onyx:older"], people: [] }));
    const box = await button("worlds", "onyx:bubble");
    expect(box.textContent).toBe("Follow");
    press(box);
    expect(box.textContent).toBe("Following");
    expect(follows()).toEqual({ worlds: ["onyx:bubble", "onyx:older"], people: [] });
    press(box);
    expect(box.textContent).toBe("Follow");
    expect(follows()).toEqual({ worlds: ["onyx:older"], people: [] });
  });

  it("follows a person by their address, apart from the worlds", async () => {
    const box = await button("people", ALICE);
    press(box);
    expect(follows()).toEqual({ worlds: [], people: [ALICE] });
  });

  it("keeps 500 at most, the oldest dropped", async () => {
    const worlds = Array.from({ length: FOLLOWS_KEPT }, (_, i) => `onyx:w${String(i)}`);
    localStorage.setItem("gnoworld:device:follows", JSON.stringify({ worlds, people: [] }));
    const box = await button("worlds", "onyx:new");
    press(box);
    const kept = (follows() as { worlds: string[] }).worlds;
    expect(kept).toHaveLength(FOLLOWS_KEPT);
    expect(kept[0]).toBe("onyx:new");
    expect(kept).not.toContain(`onyx:w${String(FOLLOWS_KEPT - 1)}`);
  });

  it("says the change holds for this visit only when the device refuses it", async () => {
    const box = await button("worlds", "onyx:bubble");
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("full", "QuotaExceededError");
    });
    press(box);
    expect(box.textContent).toContain("Following");
    expect(box.textContent).toContain("Kept for this visit only: this device keeps nothing");
  });
});

describe("the worlds followed in a universe", () => {
  it("are the universe's alone, by their ids, the last followed first", () => {
    expect(worldsFollowedIn({ worlds: ["onyx:b", "gnoland:x", "onyx:a", "onyxx:c"], people: [] }, "onyx")).toEqual([
      "b",
      "a",
    ]);
  });
});
