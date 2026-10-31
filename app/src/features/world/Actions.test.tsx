// @vitest-environment jsdom
import { createRoot } from "react-dom/client";
import { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Actions } from "./Actions.tsx";

// Slice 5j (frames 26 and 92): the main action, then Follow and Share only if they work. Share works when the browser can
// copy the page's address; Follow needs an account's store that does not exist: it is never drawn, no dead button.
const ADDRESS = "https://gno.world/net/onyx/w/bubble";
const PROPOSALS = "/net/onyx/r/gov/dao";
let host: HTMLElement | undefined;
afterEach(() => {
  host?.remove();
  host = undefined;
  vi.unstubAllGlobals();
});
function draw(proposals?: string) {
  host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  act(() => {
    root.render(
      proposals === undefined ? <Actions address={ADDRESS} /> : <Actions address={ADDRESS} proposals={proposals} />,
    );
  });
  return host;
}
const share = (el: HTMLElement) => [...el.querySelectorAll("button")].find((b) => /^share$/i.test(b.textContent));

describe("a world's actions", () => {
  it("draws the main action: a link to the world's chat on the page, in words that say so", () => {
    vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn() } });
    const main = draw().querySelector("a");
    expect(main?.getAttribute("href")).toBe("#chat");
    expect(main?.textContent).toBe("Say hi in the chat");
    expect(main?.querySelector("svg[aria-hidden='true']")).not.toBeNull();
  });

  it("moves the focus to the chat's composer when the link is clicked, and leaves the focus alone when the chat has none (F2864)", () => {
    vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn() } });
    const el = draw();
    const chat = document.createElement("div");
    chat.id = "chat";
    const composer = document.createElement("textarea");
    chat.append(composer);
    document.body.append(chat);
    const link = el.querySelector("a");
    act(() => {
      link?.click();
    });
    expect(document.activeElement).toBe(composer);
    composer.blur();
    chat.remove();
    act(() => {
      link?.click();
    });
    expect(document.activeElement).toBe(document.body);
  });

  it("never draws Follow", () => {
    vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn() } });
    expect(draw().textContent).not.toMatch(/follow/i);
  });

  it("copies the page's canonical address on Share, and says it did, in a status", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const el = draw();
    expect(el.querySelector("[role='status']")?.textContent).toBe("");
    await act(async () => {
      share(el)?.click();
      await Promise.resolve();
    });
    expect(writeText).toHaveBeenCalledExactlyOnceWith(ADDRESS);
    expect(el.querySelector("[role='status']")?.textContent).toBe("Copied");
  });

  it("takes the click again, and lets the words go after a moment", async () => {
    vi.useFakeTimers();
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const el = draw();
    for (let click = 0; click < 2; click += 1) {
      await act(async () => {
        share(el)?.click();
        await Promise.resolve();
      });
    }
    expect(writeText).toHaveBeenCalledTimes(2);
    expect(el.querySelector("[role='status']")?.textContent).toBe("Copied");
    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    expect(el.querySelector("[role='status']")?.textContent).toBe("");
    vi.useRealTimers();
  });

  it("keeps the words after a second click for their whole time, not for what was left of the first's (F2870)", async () => {
    vi.useFakeTimers();
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const el = draw();
    const click = () =>
      act(async () => {
        share(el)?.click();
        await Promise.resolve();
      });
    await click();
    act(() => {
      vi.advanceTimersByTime(2_400);
    });
    await click();
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(el.querySelector("[role='status']")?.textContent).toBe("Copied");
    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    expect(el.querySelector("[role='status']")?.textContent).toBe("");
    vi.useRealTimers();
  });

  it("leaves Share out where the browser cannot copy: no clipboard, or one with no writeText", () => {
    for (const none of [{}, { clipboard: undefined }, { clipboard: {} }]) {
      vi.stubGlobal("navigator", none);
      const el = draw();
      expect(share(el)).toBeUndefined();
      expect(el.querySelectorAll("button")).toHaveLength(0);
      host?.remove();
    }
  });

  it("says the copy was refused, in words, and never that it was copied", async () => {
    vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) } });
    const el = draw();
    await act(async () => {
      share(el)?.click();
      await Promise.resolve();
    });
    expect(el.querySelector("[role='status']")?.textContent).toBe("Could not copy the address");
  });

  it("draws no Share on the server, where nothing is known of the browser", () => {
    const html = renderToStaticMarkup(<Actions address={ADDRESS} />);
    expect(html).not.toMatch(/>Share</);
    expect(html).not.toMatch(/Follow/);
    expect(html).toContain("Say hi in the chat");
  });
});

const labels = (el: HTMLElement) => [...el.querySelectorAll("a, button")].map((node) => node.textContent);

// Slice 5k (frames 22 and 27): a world with a proposals realm draws 'Read the proposals' first, as a link to a plain path of this
// site; one with none draws no such button. Where the realm comes from is a hubs.json schema change, parked (F2953).
describe("a world's actions, with proposals", () => {
  beforeEach(() => {
    vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn() } });
  });

  it("draws 'Read the proposals' first, as a link with a hidden icon, to the realm's view", () => {
    const el = draw(PROPOSALS);
    const first = el.querySelector("a, button");
    expect(first?.textContent).toBe("Read the proposals");
    expect(first?.getAttribute("href")).toBe(PROPOSALS);
    expect(first?.querySelector("svg[aria-hidden='true']")).not.toBeNull();
  });

  it("still draws Share, and never Follow", () => {
    const text = labels(draw(PROPOSALS));
    expect(text).toContain("Share");
    expect(text.join(" ")).not.toMatch(/follow/i);
  });

  // Frames 22 and 27 show the proposals first; the chat stays a click away (it is the world's core, and F2864's focus path). The
  // decision is mine, not Alexis's: it is named in the report for his review.
  it("keeps 'Say hi in the chat' after it, as a link to the chat, and makes only the proposals the solid action", () => {
    const withChat = draw(PROPOSALS);
    expect(labels(withChat)).toEqual(["Read the proposals", "Say hi in the chat", "Share"]);
    const [proposals, hi] = [...withChat.querySelectorAll("a")];
    expect(hi?.getAttribute("href")).toBe("#chat");
    expect(draw().querySelector("a[href='#chat']")?.getAttribute("data-emphasis")).toBe("solid");
    expect(proposals?.getAttribute("data-emphasis")).toBe("solid");
    expect(hi?.getAttribute("data-emphasis")).not.toBe("solid");
  });

  it("draws no 'Read the proposals' when the world has none, and 'Say hi' stays the solid action", () => {
    expect(draw().textContent).not.toMatch(/read the proposals/i);
  });

  it.each(["/net/onyx/r/gov/dao", "/r/gov/dao", "/net/gnoland/r/gov/dao-2"])("draws %j as the link", (proposals) => {
    expect(draw(proposals).querySelector("a")?.getAttribute("href")).toBe(proposals);
  });

  it.each([
    "javascript:alert(1)",
    "data:text/html,x",
    "https://evil.example/r/gov/dao",
    "//evil.example/r",
    "/\\evil.example/x",
    "/\t/evil.example",
    "/\n/evil.example",
    "/\r/evil.example",
    " /net/onyx/r/gov/dao",
    "/net/onyx/r/gov/dao ",
    "/net/onyx/r/gov/dao\u0000",
    "/net/onyx/../../evil",
    "/net/onyx/r/gov/dao?next=https://evil.example",
    "/net/onyx/r/gov/dao#x",
    "/",
    "/net//onyx",
    "r/gov/dao",
    "",
  ])("draws %j as no link at all", (proposals) => {
    expect(draw(proposals).textContent).not.toMatch(/read the proposals/i);
  });
});
