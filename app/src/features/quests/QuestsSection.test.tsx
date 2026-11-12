// @vitest-environment jsdom
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { all, modals, noMedia, settled } from "../../../tests/mount.tsx";
import { mountInStore } from "../../../tests/inStore.tsx";
import { QuestsSection } from "./QuestsSection.tsx";

// The quests as cards in a row: each with its badge, its steps with the next one lit, and its one button at the card's foot.
beforeAll(modals);
beforeEach(() => {
  noMedia();
  localStorage.clear();
});

async function drawn(done: Record<string, string[]> = {}) {
  localStorage.setItem("gnoworld:device:quests", JSON.stringify(done));
  const { box, store } = await mountInStore(<QuestsSection universe="onyx" />);
  await settled(() => store.getState().device.readable);
  return box;
}

describe("the quests' cards", () => {
  it("holds each card's button last, after its steps, so a row of cards keeps them at one foot", async () => {
    const box = await drawn();
    const cards = all(box, "article");
    expect(cards.length).toBeGreaterThan(1);
    for (const card of cards) {
      const foot = card.querySelector("footer");
      expect(foot?.querySelector("a, button")).not.toBeNull();
      expect(card.querySelector("ul")?.compareDocumentPosition(foot ?? card)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
      expect(foot?.parentElement?.parentElement?.lastElementChild).toBe(foot?.parentElement);
    }
  });

  it("lights the next step, strikes the done ones and earns the badge with the last", async () => {
    const box = await drawn({ named: ["read"] });
    const named = all(box, "article")[0];
    const steps = [...(named?.querySelectorAll("li") ?? [])];
    expect(steps.map((step) => step.dataset["state"])).toEqual(["done", "next"]);
    expect(named?.querySelector("svg[role='img']")?.getAttribute("aria-label")).toBe("Named, not earned yet");
  });
});
