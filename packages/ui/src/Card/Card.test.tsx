import { render, screen, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { describe, expect, it } from "vitest";
import { eachStory, staysText } from "../testing.tsx";
import { Card } from "./Card.tsx";
import * as stories from "./Card.stories.tsx";

describe("Card", () => {
  it("is an article named by its header's title, its parts in order", () => {
    render(
      <Card>
        <Card.Header icon="chat" kicker="Poll" title="Which realm next?" state="Live" />
        <Card.Body>
          <p>Three answers</p>
        </Card.Body>
        <Card.Actions>
          <button type="button">Vote</button>
        </Card.Actions>
      </Card>,
    );
    const card = screen.getByRole("article", { name: "Which realm next?" });
    expect(within(card).getByRole("heading", { name: "Which realm next?" })).toBeTruthy();
    expect(within(card).getByText("Poll")).toBeTruthy();
    expect(within(card).getByText("Live")).toBeTruthy();
    expect(card.textContent).toBe("PollWhich realm next?LiveThree answersVote");
  });

  // F5730: a card may set its title large, the light title-size of the frames; by default it is the body's.
  it("sets its title large when asked, and leaves it at the body's size otherwise", () => {
    render(
      <Card>
        <Card.Header title="Plain" />
        <Card.Header title="Big" size="large" />
      </Card>,
    );
    expect(screen.getByRole("heading", { name: "Plain" }).dataset["size"]).toBeUndefined();
    expect(screen.getByRole("heading", { name: "Big" }).dataset["size"]).toBe("large");
  });

  // The card drawn with these props, and its tone, edge and density as its attributes say them.
  function look(props: Omit<ComponentProps<typeof Card>, "children">) {
    render(
      <Card {...props}>
        <Card.Body>x</Card.Body>
      </Card>,
    );
    const card = screen.getByRole("article");
    return [card.dataset["tone"], card.dataset["edge"], card.dataset["density"]];
  }

  // Under a page's h1, a card's title is an h2 (F305): its level is the page's to say, 3 unless asked.
  it.each([2, 3, 4] as const)("titles itself at the level it is given: %i", (level) => {
    render(
      <Card>
        <Card.Header title="Which realm next?" level={level} />
      </Card>,
    );
    expect(screen.getByRole("heading", { name: "Which realm next?", level })).toBeTruthy();
  });

  it("titles itself at level 3 unless asked", () => {
    render(
      <Card>
        <Card.Header title="Which realm next?" />
      </Card>,
    );
    expect(screen.getByRole("heading", { name: "Which realm next?", level: 3 })).toBeTruthy();
  });

  it("is neutral, solid and comfortable unless asked", () => {
    expect(look({})).toEqual(["neutral", "solid", "comfortable"]);
  });

  it("takes the signal tone, a dashed edge and the compact density", () => {
    expect(look({ tone: "signal", dashed: true, compact: true })).toEqual(["signal", "dashed", "compact"]);
  });

  it("gives each card a title of its own to be named by, whatever their words", () => {
    render(
      <>
        <Card>
          <Card.Header title="Poll" />
          <Card.Body>a</Card.Body>
        </Card>
        <Card>
          <Card.Header title="Poll" />
          <Card.Body>b</Card.Body>
        </Card>
      </>,
    );
    const both = screen.getAllByRole("article", { name: "Poll" });
    expect(new Set(both.map((c) => c.getAttribute("aria-labelledby"))).size).toBe(2);
    for (const card of both) expect(within(card).getByRole("heading").id).toBe(card.getAttribute("aria-labelledby"));
  });

  it("shows no state when it has none", () => {
    render(
      <Card>
        <Card.Header kicker="Poll" title="Which realm next?" />
      </Card>,
    );
    expect(screen.getByRole("article").textContent).toBe("PollWhich realm next?");
  });

  it("shows a header's words made of markup, or very long, as text", () => {
    staysText((text) => (
      <Card>
        <Card.Header kicker={text} title={text} state={text} />
      </Card>
    ));
  });

  it("has stories for each tone, dashed and compact", () => {
    const looks = eachStory(stories, (container) => {
      const card = container.querySelector<HTMLElement>("article");
      return [card?.dataset["tone"], card?.dataset["edge"], card?.dataset["density"]].join();
    });
    expect(looks.some((l) => l.startsWith("signal"))).toBe(true);
    expect(looks.some((l) => l.includes("dashed"))).toBe(true);
    expect(looks.some((l) => l.endsWith("compact"))).toBe(true);
  });
});
