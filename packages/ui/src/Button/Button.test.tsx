import { readFileSync } from "node:fs";
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { eachStory, staysText } from "../testing.tsx";
import { Button, type ButtonProps } from "./Button.tsx";
import * as stories from "./Button.stories.tsx";

// jsdom's URL is not the one node reads a file from.
// This project's module URLs start at the repository's root (/packages/…), where Vitest runs.
const sheet = readFileSync(`.${new URL("./Button.module.css", import.meta.url).pathname}`, "utf8");

// What a rule of the sheet sets, its declarations as one line, its comments left out.
const rule = (selector: string) =>
  (new RegExp(`\\n  ${selector.replaceAll(/[.[\]()*+?^$|]/g, "\\$&")} \\{([^}]*)\\}`).exec(sheet)?.[1] ?? "")
    .replaceAll(/\/\*[\s\S]*?\*\//g, "")
    .replaceAll(/\s+/g, " ")
    .trim();

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

// tsc fails this line the day a link-button takes disabled, busy or a click handler.
type Linked = Extract<ButtonProps, { href: string }>;
const linkTakesNoPress: [Linked["disabled"], Linked["busy"], Linked["onClick"]] extends [
  undefined,
  undefined,
  undefined,
]
  ? true
  : false = true;

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

  it("draws an icon only when given one, and its spinner only while busy", () => {
    const { container, rerender } = render(<Button>Go</Button>);
    expect(container.querySelectorAll("svg, span[aria-hidden='true']")).toHaveLength(0);
    rerender(<Button icon="plus">Go</Button>);
    expect(container.querySelectorAll("svg")).toHaveLength(1);
    rerender(<Button busy>Go</Button>);
    expect(container.querySelectorAll("span[aria-hidden='true']")).toHaveLength(1);
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

  it("with an href, is a link that wears the button's look, and no button", () => {
    render(
      <Button href="/w/bubble" emphasis="solid" icon="planet">
        Fly to Bubble
      </Button>,
    );
    const link = screen.getByRole("link", { name: "Fly to Bubble" });
    expect(link.getAttribute("href")).toBe("/w/bubble");
    expect([link.dataset["emphasis"], link.dataset["tone"], link.dataset["size"]]).toEqual(["solid", "neutral", "m"]);
    expect(link.hasAttribute("type")).toBe(false);
    expect(link.querySelector("svg")?.dataset["icon"]).toBe("planet");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("as a link, wears its tone and size too", () => {
    render(
      <Button href="/rooms/leave" tone="danger" size="l">
        Leave the room
      </Button>,
    );
    const link = screen.getByRole("link", { name: "Leave the room" });
    expect([link.dataset["tone"], link.dataset["size"]]).toEqual(["danger", "l"]);
  });

  // The composer's Ask Jarvis drew its violet and its close spark from outside, over the button's own rules (lot E, E4).
  it("takes the signal tone, Jarvis's violet: its words', its edge's and, solid, its fill's", () => {
    render(<Button tone="signal">Jarvis</Button>);
    expect(screen.getByRole("button").dataset["tone"]).toBe("signal");
    expect(rule('.button[data-tone="signal"]')).toBe(
      "--_accent: var(--color-signal); --_text: var(--color-signal); --_edge: var(--color-signal-line);",
    );
  });

  it("keeps its icon close to the control before it when its lead is close: a step less at its start", () => {
    const { rerender } = render(<Button>Jarvis</Button>);
    expect(screen.getByRole("button").hasAttribute("data-lead")).toBe(false);
    rerender(<Button lead="close">Jarvis</Button>);
    expect(screen.getByRole("button").dataset["lead"]).toBe("close");
    expect(rule('.button[data-lead="close"]')).toBe("--_pad: var(--space-2xs) var(--space-xs);");
  });

  // The plate's talk bar stretched its link over the bar and lit it with the bar's hover, from outside (lot E, E4).
  it("stretched, covers its positioned box with its press and answers that box's hover as its own", () => {
    const { rerender } = render(<Button href="#chat">Open chat</Button>);
    expect(screen.getByRole("link").hasAttribute("data-stretch")).toBe(false);
    rerender(
      <Button href="#chat" stretch>
        Open chat
      </Button>,
    );
    expect(screen.getByRole("link", { name: "Open chat" }).hasAttribute("data-stretch")).toBe(true);
    expect(rule(".button[data-stretch]::after")).toBe('content: ""; position: absolute; inset: 0;');
    expect(rule(".button[data-stretch]:hover")).toBe("--_fill: var(--color-fill-hover);");
  });

  // The composer's format bar drew its tools' ink and their narrow height from outside, reaching its link tool's button too (lot E, E4).
  it("as a bar's tool, takes the bar's faint ink, and the smallest height where its box is under 24 rem", () => {
    const { rerender } = render(<Button>Link</Button>);
    expect(screen.getByRole("button").hasAttribute("data-tool")).toBe(false);
    rerender(<Button tool>Link</Button>);
    expect(screen.getByRole("button").hasAttribute("data-tool")).toBe(true);
    expect(rule(".button[data-tool]")).toBe("--_ink: color-mix(in oklab, var(--color-text-muted) 62%, transparent);");
    expect(sheet).toMatch(
      /@container \(inline-size < 24rem\) \{\s*\.button\[data-tool\]:enabled \{\s*--_h: var\(--control-xs\);\s*\}/,
    );
  });

  // The plate set its links' 20 px from outside, on every link in its actions' box (lot E, E4).
  it("sits its words 20 px in when its padding is wide, a large button keeping its own", () => {
    const { rerender } = render(<Button href="#chat">Say hi</Button>);
    expect(screen.getByRole("link").hasAttribute("data-pad")).toBe(false);
    rerender(
      <Button href="#chat" pad="wide">
        Say hi
      </Button>,
    );
    expect(screen.getByRole("link").dataset["pad"]).toBe("wide");
    expect(rule('.button[data-pad="wide"]')).toBe("--_pad: 20px;");
    expect(sheet.indexOf('.button[data-pad="wide"]')).toBeLessThan(sheet.indexOf('.button[data-size="l"]'));
  });

  it("as a link, takes no disabled, busy or handler: it goes where its href says", () => {
    expect(linkTakesNoPress).toBe(true);
  });

  it("shows a label made of markup, or very long, as text", () => {
    staysText((text) => <Button>{text}</Button>);
  });

  it("has stories for every look, size and state the matrix declares, and one as a link", () => {
    const shown = eachStory(stories, (container) =>
      [...container.querySelectorAll<HTMLElement>("button, a[data-emphasis]")].map((b) => ({
        link: b.tagName === "A",
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
      for (const tone of ["neutral", "danger", "signal"])
        expect(shown.some((b) => b.emphasis === emphasis && b.tone === tone)).toBe(true);
    }
    for (const size of ["s", "m", "l"]) expect(shown.some((b) => b.size === size)).toBe(true);
    expect(shown.some((b) => b.disabled) && shown.some((b) => b.busy === "true") && shown.some((b) => b.icon)).toBe(
      true,
    );
    expect(Math.max(...shown.map((b) => b.label.length))).toBeGreaterThanOrEqual(40);
    expect(shown.some((b) => b.link)).toBe(true);
  });
});
