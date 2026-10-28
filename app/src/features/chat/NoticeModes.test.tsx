import type { NoticeMode } from "@gnoworld/core";
import { isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { NoticeModes, type NoticeModesProps } from "./NoticeModes.tsx";

const view = (over: Partial<NoticeModesProps> = {}) =>
  renderToStaticMarkup(<NoticeModes room="#bubble/games" mode="mentions" onMode={() => undefined} {...over} />);
const said = (html: string) =>
  html
    .replaceAll(/<[^>]+>/g, " ")
    .replaceAll(/\s+/g, " ")
    .trim();
const buttons = (html: string) =>
  [...html.matchAll(/<button[^>]*aria-pressed="(true|false)"[^>]*>(.*?)<\/button>/gs)].map((m) => [
    said(m[2] ?? ""),
    m[1],
  ]);

// 4f-n: a room's notification mode, all, mentions or none, chosen in the room (ADR-0002, "Menu and settings").
describe("NoticeModes", () => {
  it("is a group named for its room, holding the three modes by name, as pressed buttons", () => {
    const html = view();
    expect(html).toMatch(/role="group"[^>]*aria-label="Notifications for #games"/);
    expect(buttons(html).map(([name]) => name)).toEqual(["All messages", "Mentions", "Nothing"]);
  });

  it.each([
    ["all", "All messages"],
    ["mentions", "Mentions"],
    ["none", "Nothing"],
  ] as const)("presses the button of the mode %s, and it alone", (mode, name) => {
    expect(buttons(view({ mode })).filter(([, pressed]) => pressed === "true")).toEqual([[name, "true"]]);
  });

  it("says in words that Nothing leaves out the mentions too, which the name alone does not tell", () => {
    expect(said(view({ mode: "none" }))).toContain("not even mentions");
  });

  it("says beside the choice when the device does not keep it, and only then", () => {
    expect(said(view({ notKept: true }))).toContain("Not kept on this device");
    expect(view()).not.toContain("Not kept on this device");
  });

  // R13: each button sets its own mode; static markup cannot press one, so the handlers are read off the element tree
  // (the node project has no DOM), the Chips' onClick in the order drawn, and the journey presses them in a browser.
  const handlers = (node: ReactNode): (() => void)[] => {
    if (!isValidElement<{ onClick?: () => void; children?: ReactNode }>(node)) {
      return Array.isArray(node) ? node.flatMap(handlers) : [];
    }
    const { onClick, children } = node.props;
    return [...(onClick === undefined ? [] : [onClick]), ...handlers(children)];
  };
  it.each([
    [0, "all"],
    [1, "mentions"],
    [2, "none"],
  ] as const)("tells, for the button drawn at %i, the mode %s and no other", (at, mode) => {
    const told: NoticeMode[] = [];
    const press = handlers(NoticeModes({ room: "#bubble/games", mode: "mentions", onMode: (next) => told.push(next) }));
    expect(press).toHaveLength(3);
    press[at]?.();
    expect(told).toEqual([mode]);
  });
});
