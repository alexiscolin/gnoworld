// @vitest-environment jsdom
import type { ShownLine } from "@gnoworld/core";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
// mount.tsx also sets the act environment and the popover stand-in for the whole file.
import { modals, settled } from "../../../tests/mount.tsx";
import type { LineViewProps } from "./LineView.tsx";

// A page's preview under a line (8f, frames 104 and 107): a line whose link points at a realm's home on the default universe's gnoweb
// shows that page's capture, once the moderation has checked the line (ADR-0002 §6, "Link previews wait for the check"). The page asks
// the site's own captures' file, once a page however many lines link, and never the address a line holds.
const ALICE = "g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv";
const GOVDAO = "https://onyx.testnets.gno.land/r/gov/dao";
const CAPTURE = { path: "gno.land/r/gov/dao", captured: "2026-11-05T10:00:00.000Z", text: "# GovDAO\n" };
const FILE = { version: 1, universe: "onyx", updated: "2026-11-05T10:00:01.000Z", previews: [CAPTURE] };
let asked: string[] = [];

// Each test a page of its own: the captures' file is read once a page, so each loads the modules afresh.
beforeEach(() => {
  modals();
  asked = [];
  vi.resetModules();
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => {
      asked.push(url);
      return Promise.resolve(url.endsWith("previews.json") ? Response.json(FILE) : new Response("no", { status: 404 }));
    }),
  );
});
const roots: Root[] = [];
afterEach(() => {
  for (const root of roots.splice(0))
    act(() => {
      root.unmount();
    });
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

const line = (text: string, id = "a"): ShownLine => ({
  id,
  time: "2026-11-05T15:32:00.000Z",
  from: ALICE,
  account: ALICE,
  text,
  kind: "message",
});
const props = (text: string, over: Partial<LineViewProps> = {}): LineViewProps => ({
  line: line(text),
  me: undefined,
  members: new Set([ALICE]),
  stop: false,
  actions: null,
  fresh: false,
  verdict: "checked",
  players: true,
  saved: false,
  pinned: false,
  chips: undefined,
  react: undefined,
  answers: undefined,
  ...over,
});

// A list of lines drawn in the page, and a way to draw them again with other props.
async function drawn(rows: LineViewProps[]) {
  // The page's slots filled as the shell fills them (plugs.ts), in this test's own modules.
  await import("../../plugs.ts");
  const { LineView } = await import("./LineView.tsx");
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  roots.push(root);
  const draw = (list: LineViewProps[]) => {
    act(() => {
      root.render(
        <ol>
          {list.map((each) => (
            <LineView key={each.line.id} {...each} />
          ))}
        </ol>,
      );
    });
  };
  draw(rows);
  return { host, draw };
}
const cards = (host: HTMLElement) => [...host.querySelectorAll("button[data-preview]")];
const previewsAsked = () => asked.filter((url) => url.endsWith("/previews.json")).length;

describe("a page's preview under a line", () => {
  it("shows the capture of the page a checked line links to, under its words", async () => {
    const { host } = await drawn([props(`how the hub looked last week ${GOVDAO}`)]);
    await settled(() => cards(host).length === 1);
    const [card] = cards(host);
    expect(card?.textContent).toContain("gno.land/r/gov/dao · captured");
    const words = host.querySelector("[data-line-text]");
    expect(words !== null && card !== undefined && (words.compareDocumentPosition(card) & 4) !== 0).toBe(true);
  });

  it("waits for the line's check: none while it waits, the card once checked, none again once hidden", async () => {
    const { host, draw } = await drawn([props(GOVDAO, { verdict: undefined })]);
    // The sync point of an absence: the line's words are drawn and nothing was asked for it.
    await settled(() => host.querySelector("[data-line-text]") !== null);
    expect(cards(host)).toEqual([]);
    expect(previewsAsked()).toBe(0);
    draw([props(GOVDAO, { verdict: "checked" })]);
    await settled(() => cards(host).length === 1);
    draw([props(GOVDAO, { verdict: "hidden" })]);
    expect(cards(host)).toEqual([]);
  });

  it("follows the line's words as they change: an edit's new link waits for its own check, then shows its own page", async () => {
    // A line linking GovDAO beside it is the sync point of each absence: its card says the file and the drawings have come.
    const beside = { ...props(GOVDAO), line: line(GOVDAO, "b") };
    const first = () => host.querySelectorAll("li")[0]?.querySelector("button[data-preview]") ?? null;
    const { host, draw } = await drawn([props("https://onyx.testnets.gno.land/r/samcrew/memba"), beside]);
    await settled(() => cards(host).length === 1);
    expect(first()).toBeNull();
    // The correction comes with no verdict, as the stream leaves an edit until its check (F2000).
    draw([props(GOVDAO, { verdict: undefined }), beside]);
    expect(first()).toBeNull();
    draw([props(GOVDAO, { verdict: "checked" }), beside]);
    await settled(() => cards(host).length === 2);
    draw([props("no link now", { verdict: "checked" }), beside]);
    expect(first()).toBeNull();
    expect(cards(host)).toHaveLength(1);
  });

  it("shows none for a page the captures' file does not hold, nor for a link to another chain's gnoweb", async () => {
    const { host } = await drawn([
      {
        ...props("https://onyx.testnets.gno.land/r/samcrew/memba"),
        line: line("https://onyx.testnets.gno.land/r/samcrew/memba", "a"),
      },
      { ...props("https://gno.land/r/gov/dao"), line: line("https://gno.land/r/gov/dao", "b") },
      { ...props(GOVDAO), line: line(GOVDAO, "c") },
    ]);
    // The third line's card is the sync point: the file has come, and the two others drew none.
    await settled(() => cards(host).length === 1);
    expect(host.querySelectorAll("li")[2]?.querySelector("button[data-preview]")).not.toBeNull();
  });

  it("asks the site's own file once a page, however many lines link, and never the address a line holds", async () => {
    const { host } = await drawn(
      ["a", "b", "c"].map((id) => ({
        ...props(GOVDAO),
        line: line(`${GOVDAO} and https://evil.example/r/gov/dao`, id),
      })),
    );
    await settled(() => cards(host).length === 3);
    expect(previewsAsked()).toBe(1);
    expect(asked.length).toBeGreaterThan(0);
    expect(asked.every((url) => url.endsWith("/previews.json"))).toBe(true);
  });

  it("asks nothing for lines with no link to a page", async () => {
    const { host } = await drawn([
      props("gm from Lagos"),
      { ...props("watch https://youtu.be/dQw4w9WgXcQ"), line: line("watch https://youtu.be/dQw4w9WgXcQ", "b") },
    ]);
    // The player's card is the sync point: the lines are drawn whole.
    await settled(() => host.textContent.includes("YouTube video"));
    expect(asked).toEqual([]);
    expect(cards(host)).toEqual([]);
  });

  it("draws a player's card and the page's preview when a line links both", async () => {
    const { host } = await drawn([props(`https://youtu.be/dQw4w9WgXcQ ${GOVDAO}`)]);
    await settled(() => cards(host).length === 1);
    expect(host.textContent).toContain("YouTube video");
  });

  it("keeps the card out of the Tab order on a line that is not the list's stop, and in it on the stop", async () => {
    const { host, draw } = await drawn([props(GOVDAO, { stop: false })]);
    await settled(() => cards(host).length === 1);
    expect(cards(host)[0]?.getAttribute("tabindex")).toBe("-1");
    draw([props(GOVDAO, { stop: true })]);
    expect(cards(host)[0]?.getAttribute("tabindex")).not.toBe("-1");
  });

  // F896's class (8f's review, finding 2): a hide or an edit takes the card away while it, or its open capture, holds the focus.
  it.each([
    ["the card held the focus", false],
    ["its open capture held the focus", true],
  ])("gives the focus back to its line when the check hides it and %s", async (_, opened) => {
    const { host, draw } = await drawn([props(GOVDAO, { stop: true })]);
    await settled(() => cards(host).length === 1);
    const card = cards(host)[0];
    if (!(card instanceof HTMLElement)) throw new Error("no card");
    act(() => {
      card.focus();
      if (opened) card.click();
    });
    if (opened) {
      const heading = host.querySelector<HTMLElement>("dialog[open] h2, dialog[open] [tabindex='-1']");
      act(() => {
        heading?.focus();
      });
    }
    expect(host.contains(document.activeElement)).toBe(true);
    draw([props(GOVDAO, { stop: true, verdict: "hidden" })]);
    expect(cards(host)).toEqual([]);
    expect(document.activeElement).toBe(host.querySelector("li"));
  });
});
