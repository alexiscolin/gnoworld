import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { eachStory, staysText } from "../testing.tsx";
import { Button } from "./Button.tsx";
import * as stories from "./Button.stories.tsx";

// A form that counts its submissions, the button rendered inside it.
function inForm(button: ReactElement) {
  const submitted = vi.fn((event: SubmitEvent) => {
    event.preventDefault();
  });
  const form = document.createElement("form");
  form.addEventListener("submit", submitted);
  document.body.append(form);
  render(button, { container: form });
  return submitted;
}

describe("Button", () => {
  it("is a button named by its label, which submits nothing unless asked", () => {
    render(<Button>Read the proposals</Button>);
    expect(screen.getByRole("button", { name: "Read the proposals" }).getAttribute("type")).toBe("button");
  });

  it("submits its form when its type is submit", async () => {
    const submitted = inForm(<Button type="submit">Send</Button>);
    await userEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(submitted).toHaveBeenCalledOnce();
  });

  it("is outline, neutral and medium unless asked otherwise", () => {
    render(<Button>Read it · free</Button>);
    const button = screen.getByRole("button");
    expect([button.dataset["emphasis"], button.dataset["tone"], button.dataset["size"]]).toEqual([
      "outline",
      "neutral",
      "m",
    ]);
  });

  it.each([
    ["solid", "neutral", "l"],
    ["quiet", "neutral", "s"],
    ["solid", "danger", "m"],
    ["outline", "danger", "s"],
    ["quiet", "danger", "l"],
  ] as const)("shows emphasis %s, tone %s and size %s as attributes the style reads", (emphasis, tone, size) => {
    render(
      <Button emphasis={emphasis} tone={tone} size={size}>
        Delete the room
      </Button>,
    );
    const button = screen.getByRole("button");
    expect([button.dataset["emphasis"], button.dataset["tone"], button.dataset["size"]]).toEqual([
      emphasis,
      tone,
      size,
    ]);
  });

  it("calls its handler once per click, and from the keyboard", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Join the chat</Button>);
    await user.click(screen.getByRole("button"));
    await user.keyboard("{Enter}");
    await user.keyboard(" ");
    expect(onClick).toHaveBeenCalledTimes(3);
  });

  it("does nothing while disabled", async () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Register
      </Button>,
    );
    const button = screen.getByRole("button");
    await userEvent.click(button);
    expect(button.hasAttribute("disabled")).toBe(true);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("while busy: keeps the focus, says it is busy, and ignores clicks and keys", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <Button busy onClick={onClick}>
        Waiting for Adena
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Waiting for Adena" });
    await user.click(button);
    await user.keyboard("{Enter}");
    await user.keyboard(" ");
    expect(document.activeElement).toBe(button);
    expect(button.hasAttribute("disabled")).toBe(false);
    expect(button.getAttribute("aria-busy")).toBe("true");
    expect(button.getAttribute("aria-disabled")).toBe("true");
    expect(onClick).not.toHaveBeenCalled();
  });

  it("while busy, submits its form neither by a click nor by Enter", async () => {
    const user = userEvent.setup();
    const submitted = inForm(
      <Button type="submit" busy>
        Sending
      </Button>,
    );
    await user.click(screen.getByRole("button", { name: "Sending" }));
    await user.keyboard("{Enter}");
    expect(submitted).not.toHaveBeenCalled();
  });

  it("disabled and busy: both said, and nothing happens", async () => {
    const onClick = vi.fn();
    render(
      <Button disabled busy onClick={onClick}>
        Waiting for Adena
      </Button>,
    );
    const button = screen.getByRole("button");
    await userEvent.click(button);
    expect([button.hasAttribute("disabled"), button.getAttribute("aria-busy")]).toEqual([true, "true"]);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("says nothing of busy or disabled when it is neither", () => {
    render(<Button>Vote</Button>);
    const button = screen.getByRole("button");
    expect([button.getAttribute("aria-busy"), button.getAttribute("aria-disabled")]).toEqual([null, null]);
  });

  it.each([
    ["s", "m"],
    ["m", "m"],
    ["l", "l"],
  ] as const)("at size %s, draws its icon at %s, before the label and hidden from its name", (size, iconSize) => {
    render(
      <Button icon="planet" size={size}>
        Fly to Earth
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Fly to Earth" });
    const svg = button.querySelector("svg");
    expect(button.firstElementChild).toBe(svg);
    expect(svg?.getAttribute("aria-hidden")).toBe("true");
    expect(svg?.dataset["size"]).toBe(iconSize);
  });

  it("shows a label made of markup, or very long, as text", () => {
    staysText((text) => <Button>{text}</Button>);
  });

  it("has stories for every look, size and state the matrix declares", () => {
    const shown = eachStory(stories, () =>
      screen.getAllByRole("button").map((b) => ({
        emphasis: b.dataset["emphasis"],
        tone: b.dataset["tone"],
        size: b.dataset["size"],
        busy: b.getAttribute("aria-busy"),
        disabled: b.hasAttribute("disabled"),
        icon: b.querySelector("svg") !== null,
        label: b.textContent,
      })),
    ).flat();
    for (const emphasis of ["solid", "outline", "quiet"]) {
      for (const tone of ["neutral", "danger"])
        expect(shown.some((b) => b.emphasis === emphasis && b.tone === tone)).toBe(true);
    }
    for (const size of ["s", "m", "l"]) expect(shown.some((b) => b.size === size)).toBe(true);
    expect(shown.some((b) => b.disabled) && shown.some((b) => b.busy === "true") && shown.some((b) => b.icon)).toBe(
      true,
    );
    expect(Math.max(...shown.map((b) => b.label.length))).toBeGreaterThanOrEqual(40);
  });
});
