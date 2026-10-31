import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Icon } from "../icons/Icon.tsx";
import { eachStory, staysText } from "../testing.tsx";
import { NavItem } from "./NavItem.tsx";
import * as stories from "./NavItem.stories.tsx";

describe("NavItem", () => {
  it("is a link named by its words when it has an address, and a button when it has an act", async () => {
    const act = vi.fn();
    render(
      <>
        <NavItem href="/w/bubble?room=games">#games</NavItem>
        <NavItem onClick={act}>Saved</NavItem>
      </>,
    );
    expect(screen.getByRole("link", { name: "#games" }).getAttribute("href")).toBe("/w/bubble?room=games");
    await userEvent.click(screen.getByRole("button", { name: "Saved" }));
    expect(act).toHaveBeenCalledTimes(1);
  });

  it("says the item in view on its link, and fills the whole item, which a plain one does not", () => {
    const { container } = render(
      <>
        <NavItem href="/a" current>
          #general
        </NavItem>
        <NavItem href="/b">#help</NavItem>
      </>,
    );
    expect(screen.getByRole("link", { name: "#general" }).getAttribute("aria-current")).toBe("true");
    expect(screen.getByRole("link", { name: "#help" }).hasAttribute("aria-current")).toBe(false);
    const [first, second] = [...container.querySelectorAll("[data-nav-item]")];
    expect(first?.hasAttribute("data-current")).toBe(true);
    expect(second?.hasAttribute("data-current")).toBe(false);
  });

  it("draws a lead before the words", () => {
    render(
      <NavItem onClick={() => undefined} lead={<Icon name="bookmark" />}>
        Saved
      </NavItem>,
    );
    const button = screen.getByRole("button", { name: "Saved" });
    expect(button.querySelector("svg")?.compareDocumentPosition(screen.getByText("Saved"))).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  it("shows a count at its end, read as the words it is given, and keeps the link's name its own words", () => {
    render(
      <NavItem href="/a" badge={{ count: "3", said: "3 unread" }}>
        #help
      </NavItem>,
    );
    expect(screen.getByRole("link", { name: "#help" })).toBeTruthy();
    expect(screen.getByText("3").getAttribute("aria-hidden")).toBe("true");
    expect(screen.getByText("3 unread").classList.contains("visually-hidden")).toBe(true);
  });

  it("shows a dot with no count when the badge has none, and says it in words", () => {
    const { container } = render(
      <NavItem href="/a" badge={{ said: "2 unread" }}>
        noor
      </NavItem>,
    );
    expect(container.querySelector("[data-dot]")).not.toBeNull();
    expect(screen.getByText("2 unread")).toBeTruthy();
  });

  it("keeps its words as text, whatever they hold", () => {
    staysText((words) => <NavItem href="/a">{words}</NavItem>);
  });

  it("draws each of its stories", () => {
    expect(eachStory(stories, (container) => container.querySelector("[data-nav-item]") !== null)).not.toContain(false);
  });
});
