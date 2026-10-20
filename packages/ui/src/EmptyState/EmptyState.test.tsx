import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { eachStory, staysText } from "../testing.tsx";
import { EmptyState } from "./EmptyState.tsx";
import * as stories from "./EmptyState.stories.tsx";

describe("EmptyState", () => {
  it("shows its title as a heading of its level, its line, and its one action as the primary link", () => {
    render(
      <EmptyState
        level={1}
        title="No page here"
        line="Nothing on gno.world goes by this address."
        action={{ label: "Back to the universe", href: "/" }}
      />,
    );
    expect(screen.getByRole("heading", { level: 1, name: "No page here" })).toBeTruthy();
    expect(screen.getByText("Nothing on gno.world goes by this address.").tagName).toBe("P");
    const way = screen.getByRole("link", { name: "Back to the universe" });
    expect(way.getAttribute("href")).toBe("/");
    expect(way.dataset["emphasis"]).toBe("solid");
  });

  it("is a heading of level 2 unless asked, with no link when it has no action", () => {
    render(<EmptyState title="No rooms yet" line="A world opens its rooms once it has members." />);
    expect(screen.getByRole("heading", { level: 2, name: "No rooms yet" })).toBeTruthy();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("links where its action says", () => {
    render(
      <EmptyState
        title="No rooms yet"
        line="Bubble opens its rooms soon."
        action={{ label: "Fly to Bubble", href: "/w/bubble" }}
      />,
    );
    expect(screen.getByRole("link", { name: "Fly to Bubble" }).getAttribute("href")).toBe("/w/bubble");
  });

  it("shows a title, a line and an action's label made of markup, or very long, as text", () => {
    staysText((text) => <EmptyState title={text} line={text} />);
    staysText((text) => <EmptyState title="No rooms yet" line="None" action={{ label: text, href: "/" }} />);
  });

  it("has stories with an action and without", () => {
    const links = eachStory(stories, (container) => container.querySelectorAll("a").length);
    expect(links).toContain(0);
    expect(links).toContain(1);
  });
});
