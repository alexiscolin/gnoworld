import { readFileSync } from "node:fs";
import { render } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { eachStory } from "../testing.tsx";
import { ChatLayout } from "./ChatLayout.tsx";
import * as stories from "./ChatLayout.stories.tsx";

// 5q: the full-screen chat's frame (docs/DESIGN-SYSTEM.md, "Chat dock"; the video's frame 23.58.01): a header across,
// then the column of worlds, the room sidebar, the conversation and the info panel. It places; the app fills the slots.
const full = (
  <ChatLayout header={<div>head</div>} worlds={<div>worlds</div>} rooms={<div>rooms</div>} info={<div>info</div>}>
    <div>talk</div>
  </ChatLayout>
);
const regions = (container: HTMLElement) =>
  [...container.querySelectorAll<HTMLElement>("[data-region]")].map((region) => region.dataset["region"]);

describe("ChatLayout", () => {
  it("places the header, then the worlds, the rooms, the conversation and the info, in the order a reader and the Tab key meet them", () => {
    const { container } = render(full);
    expect(regions(container)).toEqual(["header", "worlds", "rooms", "conversation", "info"]);
    expect(container.textContent).toBe("headworldsroomstalkinfo");
  });

  it("draws no region for a slot it is not given: no info panel, no column of worlds", () => {
    const { container } = render(
      <ChatLayout header={<div>head</div>} rooms={<div>rooms</div>}>
        <div>talk</div>
      </ChatLayout>,
    );
    expect(regions(container)).toEqual(["header", "rooms", "conversation"]);
  });

  it("holds what is said in the conversation's region, a column that may shrink below its content so its own list scrolls", () => {
    const { container } = render(full);
    expect(container.querySelector('[data-region="conversation"]')?.textContent).toBe("talk");
  });

  it("gives the info panel the conversation's place on a narrow screen when it is asked to, a thread's", () => {
    const { container } = render(
      <ChatLayout header="h" info="i" infoFirst>
        talk
      </ChatLayout>,
    );
    expect(container.querySelector("[data-chat-layout]")?.hasAttribute("data-info-first")).toBe(true);
    expect(render(full).container.querySelector("[data-chat-layout]")?.hasAttribute("data-info-first")).toBe(false);
  });

  it("has stories for the full chat, one without its info panel, and one with the panel first", () => {
    const shown = eachStory(stories, (container) => [...container.querySelectorAll("[data-region]")].length);
    // The fourth, the band, draws the full chat's five regions as the first does.
    expect(shown).toEqual([5, 4, 5, 5]);
  });

  describe("measuring its own box", () => {
    let width = 0;
    beforeAll(() => {
      Object.defineProperty(HTMLElement.prototype, "offsetWidth", { get: () => width, configurable: true });
    });
    afterEach(() => {
      width = 0;
    });
    afterAll(() => {
      Reflect.deleteProperty(HTMLElement.prototype, "offsetWidth");
    });

    it.each([
      [900, true],
      [901, false],
    ])("tells the app a box %i px wide is compact: %s, and marks its frame as so", (px, compact) => {
      width = px;
      const told = vi.fn();
      const { container } = render(
        <ChatLayout header="h" onCompact={told}>
          <div>talk</div>
        </ChatLayout>,
      );
      expect(told).toHaveBeenLastCalledWith(compact);
      expect(container.querySelector("[data-chat-layout]")?.hasAttribute("data-compact")).toBe(compact);
    });
  });
});

// The app's full chat put its header over the columns from outside, by the regions' attributes (lot E, E4).
describe("ChatLayout's band", () => {
  it("marks its frame when its header is a band over the columns, and leaves it unmarked otherwise", () => {
    const { container, rerender } = render(full);
    const frame = () => container.querySelector("[data-chat-layout]");
    expect(frame()?.hasAttribute("data-band")).toBe(false);
    rerender(
      <ChatLayout header={<div>head</div>} band>
        <div>talk</div>
      </ChatLayout>,
    );
    expect(frame()?.hasAttribute("data-band")).toBe(true);
  });

  it("draws the band out of the columns' flow under the page's header, the columns from its foot, its controls alone taking a click", () => {
    // This project's module URLs start at the repository's root (/packages/…), where Vitest runs.
    const sheet = readFileSync(`.${new URL("./ChatLayout.module.css", import.meta.url).pathname}`, "utf8").replaceAll(
      /\/\*[\s\S]*?\*\//g,
      "",
    );
    const rule = (selector: string) =>
      (new RegExp(`\\n  ${selector.replaceAll(/[.[\]()*+?^$|]/g, "\\$&")} \\{([^}]*)\\}`).exec(sheet)?.[1] ?? "")
        .replaceAll(/\s+/g, " ")
        .trim();
    expect(rule(".frame[data-band] > .header")).toBe(
      "position: absolute; inset-block-start: var(--banner-under); inset-inline: 0; padding-inline-start: calc(var(--space-m) + max(var(--chat-inset, 0px), var(--space-l))); border-block-end: 0; pointer-events: none;",
    );
    expect(rule(".frame[data-band] > .header :is(a, button)")).toBe("pointer-events: auto;");
    expect(rule(".frame[data-band] > .header + *")).toBe(
      "margin-block-start: var(--banner-under); border-block-start: var(--line-width) solid var(--color-line);",
    );
    expect(rule(".frame[data-band] .conversation")).toBe("padding-block-start: var(--chat-head);");
  });
});
