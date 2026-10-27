// @vitest-environment jsdom
import { Address, type PinnedLine } from "@gnoworld/schemas";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Done } from "./askPins.ts";
import { PinBar, PinStack, type PinStackProps } from "./PinBar.tsx";

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

describe("the pin bar, closed", () => {
  it("draws nothing for a room with no pin", () => {
    expect(view({ pins: [] })).toBe("");
  });

  it("is a region named Pinned messages, holding one button that says the newest pin's author and words, and is not open", () => {
    const html = view({ pins: [pin("m1"), pin("m2", { account: BOB })] });
    expect(html).toMatch(/^<section[^>]*aria-label="Pinned messages"/);
    const buttons = [...html.matchAll(/<button([^>]*)>(.*?)<\/button>/gs)];
    expect(buttons).toHaveLength(1);
    expect(buttons[0]?.[1]).toContain('aria-expanded="false"');
    expect(said(buttons[0]?.[2] ?? "")).toContain("g10gh7…3y5tv text m1");
    expect(html).not.toContain("text m2");
  });

  it("says how many more there are past the first, none for one alone", () => {
    expect(said(view({ pins: [pin("m1"), pin("m2"), pin("m3")] }))).toMatch(/\+2/);
    expect(said(view())).not.toMatch(/\+\d/);
  });

  it("gives its author's address whole in a title, the line being cut to one, and the pin's words whole in the bar's own", () => {
    const text = "a long pinned line ".repeat(10);
    const html = view({ pins: [pin("m1", { text })] });
    expect(html).toContain(`title="${ALICE}"`);
    expect(html).toContain(text.trim());
  });

  it("offers no Unpin while closed, to a moderator too", () => {
    expect(view({ may: true })).not.toMatch(/Unpin/);
  });
});

describe("the pin bar, open", () => {
  it("lists every pin, the newest first as given, each with its author and its words, the button saying it is open", () => {
    const html = view({ open: true, pins: [pin("m2", { account: BOB }), pin("m1")] });
    expect(html).toContain('aria-expanded="true"');
    const rows = [...html.matchAll(/<li[^>]*>(.*?)<\/li>/gs)].map((found) => said(found[1] ?? ""));
    expect(rows).toHaveLength(2);
    expect(rows[0]).toContain("g1jg8m…vsqf5 text m2");
    expect(rows[1]).toContain("g10gh7…3y5tv text m1");
  });

  it("offers an Unpin of each pin, named for whose message it is, to a reader who may pin", () => {
    const html = view({ open: true, may: true, pins: [pin("m2", { account: BOB }), pin("m1")] });
    // React writes an apostrophe in an attribute as &#x27;: the name a browser reads is with it as it is.
    const names = [...html.matchAll(/<button[^>]*aria-label="(Unpin[^"]*)"/g)].map((found) =>
      found[1]?.replaceAll("&#x27;", "'"),
    );
    expect(names).toEqual(["Unpin g1jg8m…vsqf5's message", "Unpin g10gh7…3y5tv's message"]);
  });

  it("offers none to a reader who may not", () => {
    expect(view({ open: true, may: false, pins: [pin("m1"), pin("m2")] })).not.toMatch(/Unpin/);
  });

  // A pinned line is anyone's words: drawn as a line is, never as HTML.
  it("draws a pin's words as Markdown, a hostile one as text", () => {
    const html = view({
      open: true,
      pins: [
        pin("m1", { text: "**bold** and [a link](https://gno.land/r/demo)" }),
        pin("m2", { text: "[x](javascript:alert(1)) <img src=x onerror=alert(1)> <script>alert(1)</script>" }),
      ],
    });
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toMatch(/<a [^>]*href="https:\/\/gno\.land\/r\/demo"[^>]*rel="noopener noreferrer"/);
    expect(html).not.toMatch(/href="javascript/i);
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
    // jsdom has no popover API, which the Flash and the buttons' names use: a stand-in that does nothing.
    for (const method of ["showPopover", "hidePopover", "togglePopover"])
      Object.defineProperty(HTMLElement.prototype, method, { configurable: true, value: () => undefined });
  });
  afterEach(() => {
    act(() => {
      for (const bar of bars.splice(0)) bar.unmount();
    });
    host.replaceChildren();
  });
  const draw = (onUnpin: (id: string) => Promise<Done>) => {
    const bar = createRoot(host.appendChild(document.createElement("section")));
    bars.push(bar);
    act(() => {
      bar.render(<PinBar pins={[pin("m1"), pin("m2")]} may onUnpin={onUnpin} />);
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

  it("opens at a click on its button, and shuts at the next", () => {
    draw(() => Promise.resolve({ ok: true }));
    expect(host.querySelector("ul")).toBeNull();
    click('button[aria-expanded="false"]');
    expect(host.querySelectorAll("li")).toHaveLength(2);
    click('button[aria-expanded="true"]');
    expect(host.querySelector("ul")).toBeNull();
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
    click('button[aria-expanded="false"]');
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
    click('button[aria-expanded="false"]');
    click('button[aria-label^="Unpin"]');
    await settle();
    expect(asked).toEqual(["m1"]);
    expect(status()).toBe("");
  });
});
