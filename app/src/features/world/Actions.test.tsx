// @vitest-environment jsdom
import { createRoot } from "react-dom/client";
import { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Actions } from "./Actions.tsx";

// Slice 5j (frames 26 and 92): the main action, then Follow and Share only if they work. Share works when the browser can
// copy the page's address; Follow needs an account's store that does not exist: it is never drawn, no dead button.
const ADDRESS = "https://gno.world/net/onyx/w/bubble";
let host: HTMLElement | undefined;
afterEach(() => {
  host?.remove();
  host = undefined;
  vi.unstubAllGlobals();
});
function draw() {
  host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  act(() => {
    root.render(<Actions address={ADDRESS} />);
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
