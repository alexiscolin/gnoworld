import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LinkProvider } from "../link.tsx";
import { eachStory, staysText } from "../testing.tsx";
import { Breadcrumb } from "./Breadcrumb.tsx";
import * as stories from "./Breadcrumb.stories.tsx";

const trail = [
  { label: "gno.world", href: "/" },
  { label: "Earth", href: "/earth" },
  { label: "Bubble", href: "/w/bubble" },
];

describe("Breadcrumb", () => {
  it("is a navigation named by its label, an ordered list of the trail", () => {
    render(<Breadcrumb label="You are here" items={trail} />);
    const nav = screen.getByRole("navigation", { name: "You are here" });
    expect(nav.querySelector("ol")).not.toBeNull();
    expect(screen.getAllByRole("listitem").map((item) => item.textContent)).toEqual(["gno.world", "Earth", "Bubble"]);
  });

  it("links every step but the last, which is the current page and no link", () => {
    render(<Breadcrumb label="You are here" items={trail} />);
    expect(screen.getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual(["/", "/earth"]);
    const current = screen.getByText("Bubble");
    expect(current.closest("[aria-current]")?.getAttribute("aria-current")).toBe("page");
    expect(current.closest("a")).toBeNull();
  });

  it("marks no other step as current", () => {
    render(<Breadcrumb label="You are here" items={trail} />);
    expect(document.querySelectorAll("[aria-current]")).toHaveLength(1);
  });

  it("is one current step when the trail has one step", () => {
    render(<Breadcrumb label="You are here" items={[{ label: "gno.world" }]} />);
    expect(screen.queryAllByRole("link")).toEqual([]);
    expect(screen.getByText("gno.world").closest("[aria-current]")).not.toBeNull();
  });

  it("draws its links with the page's own link", () => {
    render(
      <LinkProvider link={(props) => <a data-routed="" {...props} />}>
        <Breadcrumb label="You are here" items={trail} />
      </LinkProvider>,
    );
    expect(screen.getAllByRole("link").every((link) => link.hasAttribute("data-routed"))).toBe(true);
  });

  it("shows a label as text, never as markup", () => {
    render(<Breadcrumb label="You are here" items={[{ label: "<img src=x onerror=alert(1)>" }]} />);
    expect(document.querySelector("img")).toBeNull();
    expect(screen.getByText("<img src=x onerror=alert(1)>")).toBeTruthy();
  });

  it("shows the words of a step, made of markup or very long, as text", () => {
    staysText((text) => <Breadcrumb label="x" items={[{ label: "home", href: "/" }, { label: text }]} />);
    staysText((text) => <Breadcrumb label="x" items={[{ label: text, href: "/" }, { label: "end" }]} />);
  });

  it("draws nothing for an empty trail: a navigation with an empty list is a fault", () => {
    const { container } = render(<Breadcrumb label="You are here" items={[]} />);
    expect(container.childElementCount).toBe(0);
  });

  it("has stories for a trail, one step and a long label, each a labelled navigation ending on the current page", () => {
    const shown = eachStory(stories, (container) => ({
      nav: container.querySelectorAll("nav[aria-label]").length,
      current: container.querySelectorAll('[aria-current="page"]').length,
    }));
    expect(shown).toHaveLength(3);
    for (const story of shown) expect(story).toEqual({ nav: 1, current: 1 });
  });
});
