import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
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
    expect(shown).toEqual([5, 4, 5]);
  });
});
