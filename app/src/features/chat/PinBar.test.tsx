// @vitest-environment jsdom
import { Address, type PinnedLine } from "@gnoworld/schemas";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Done } from "./askPins.ts";
import { PinBar, PinStack, type PinStackProps } from "./PinBar.tsx";
import { standInPopovers } from "../../../tests/popover.ts";

// The room's pins above its lines (slice 4's 4d; the prototype's #pinBar): one line, the newest pin with a count, which
// opens into the stack; each pin's author, its words drawn from Markdown as a line's are (nothing from Ergo reaches
// HTML), and for a reader who may pin, an Unpin of each. PinStack is the drawing; PinBar holds whether it is open.
const ALICE = Address.parse("g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv");
const BOB = Address.parse("g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5");
const pin = (id: string, over: Partial<PinnedLine> = {}): PinnedLine => ({
  id,
  time: "2026-10-25T10:00:00.000Z",
  account: ALICE,
  text: `text ${id}`,
  ...over,
});
const view = (over: Partial<PinStackProps> = {}) =>
  renderToStaticMarkup(
    <PinStack
      pins={[pin("m1")]}
      may={false}
      open={false}
      onToggle={() => undefined}
      onUnpin={() => undefined}
      {...over}
    />,
  );
const said = (html: string) =>
  html
    .replaceAll(/<[^>]+>/g, " ")
    .replaceAll(/\s+/g, " ")
    .trim();

describe("the pin bar", () => {
  const rowsOf = (html: string) => [...html.matchAll(/<li[^>]*>(.*?)<\/li>/gs)].map((found) => said(found[1] ?? ""));

  it("draws nothing for a room with no pin", () => {
    expect(view({ pins: [] })).toBe("");
  });

  it("is a region named Pinned messages, a line a pin with its author and its words, none with a button to open", () => {
    const html = view({ pins: [pin("m1"), pin("m2", { account: BOB })] });
    expect(html).toMatch(/^<section[^>]*aria-label="Pinned messages"/);
    expect(rowsOf(html)).toEqual(["g10gh7…3y5tv text m1", "g1jg8m…vsqf5 text m2"]);
    expect(html).not.toContain("aria-expanded");
  });

  it("shows three at once and says how many more there are, which its button opens", () => {
    const pins = [pin("m1"), pin("m2"), pin("m3"), pin("m4"), pin("m5")];
    const shut = view({ pins });
    expect(rowsOf(shut)).toHaveLength(3);
    expect(said(shut)).toMatch(/\+2$/);
    expect(shut).toContain('aria-expanded="false"');
    const open = view({ pins, open: true });
    expect(rowsOf(open)).toHaveLength(5);
    expect(said(open)).toMatch(/Hide$/);
  });

  it("gives its author's address whole in a title, and the pin's words whole in the line's", () => {
    const text = "a long pinned line ".repeat(10);
    const html = view({ pins: [pin("m1", { text })] });
    expect(html).toContain(`title="${ALICE}"`);
    expect(html).toContain(`title="${text}"`);
  });

  it("offers an Unpin of each pin, named for whose message it is, to a reader who may pin, and none to one who may not", () => {
    const html = view({ may: true, pins: [pin("m2", { account: BOB }), pin("m1")] });
    // React writes an apostrophe in an attribute as &#x27;: the name a browser reads is with it as it is.
    const names = [...html.matchAll(/<button[^>]*aria-label="(Unpin[^"]*)"/g)].map((found) =>
      found[1]?.replaceAll("&#x27;", "'"),
    );
    expect(names).toEqual(["Unpin g1jg8m…vsqf5's message", "Unpin g10gh7…3y5tv's message"]);
    expect(view({ may: false, pins: [pin("m1"), pin("m2")] })).not.toMatch(/Unpin/);
  });

  // A pinned line is anyone's words: drawn as text, never as HTML.
  it("draws a pin's words as text, a hostile one too", () => {
    const html = view({
      pins: [pin("m1", { text: "<img src=x onerror=alert(1)> <script>alert(1)</script>" })],
    });
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<script");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
  });
});

// The bar as a reader uses it: shut at first, a click opens it and a second shuts it; an Unpin the server refused, or that
// never got there, is said in a sentence, and one it took says nothing (G13).
describe("the pin bar, used", () => {
  // Each test draws one bar in its own element, taken down after it.
  const host = document.createElement("div");
  const bars: Root[] = [];
  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    standInPopovers();
  });
  afterEach(() => {
    act(() => {
      for (const bar of bars.splice(0)) bar.unmount();
    });
    host.replaceChildren();
  });
  const draw = (onUnpin: (id: string) => Promise<Done>, count = 2) => {
    const bar = createRoot(host.appendChild(document.createElement("section")));
    bars.push(bar);
    act(() => {
      bar.render(
        <PinBar pins={Array.from({ length: count }, (_, at) => pin(`m${String(at + 1)}`))} may onUnpin={onUnpin} />,
      );
    });
  };
  const click = (find: string) => {
    const button = host.querySelector(find);
    if (!(button instanceof HTMLElement)) throw new Error(`no ${find}`);
    act(() => {
      button.click();
    });
  };
  const status = () => host.querySelector('[role="status"]')?.textContent ?? "";
  const settle = () => act(() => Promise.resolve());

  it("opens the rest at a click on its count, and shuts it at the next", () => {
    draw(() => Promise.resolve({ ok: true }), 5);
    expect(host.querySelectorAll("li")).toHaveLength(3);
    click('button[aria-expanded="false"]');
    expect(host.querySelectorAll("li")).toHaveLength(5);
    click('button[aria-expanded="true"]');
    expect(host.querySelectorAll("li")).toHaveLength(3);
  });

  it.each([
    ["a refusal", () => Promise.resolve<Done>({ ok: false, reason: "forbidden" }), "Only this world's moderators"],
    [
      "a line not pinned any more",
      () => Promise.resolve<Done>({ ok: false, reason: "not_found" }),
      "not pinned any more",
    ],
    ["a server out of reach", () => Promise.reject(new Error("down")), "could not be reached"],
  ])("says why an Unpin failed, for %s", async (_, answer, said) => {
    draw(answer);
    click('button[aria-label^="Unpin"]');
    await settle();
    expect(status()).toContain("Could not unpin the message.");
    expect(status()).toContain(said);
  });

  it("says nothing of an Unpin the server took, and gives the pin's id", async () => {
    const asked: string[] = [];
    draw((id) => {
      asked.push(id);
      return Promise.resolve({ ok: true });
    });
    click('button[aria-label^="Unpin"]');
    await settle();
    expect(asked).toEqual(["m1"]);
    expect(status()).toBe("");
  });
});
