// @vitest-environment jsdom
import { createRoot } from "react-dom/client";
import { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StoreProvider } from "../../storeContext.tsx";
import { Actions } from "./Actions.tsx";

// Slice 5j (frames 26 and 92), slice 8 (frames 86, 93): the main action, then Follow and Share, whose code comes a moment after the first
// screen (PlateActs.tsx). Share opens the share sheet (features/share); the hardening slice writes their tests.
const PLACE = { name: "Bubble", path: "/net/onyx/w/bubble" };
const FOLLOW = "onyx:bubble";
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
      <StoreProvider>
        {proposals === undefined ? (
          <Actions place={PLACE} follow={FOLLOW} />
        ) : (
          <Actions place={PLACE} follow={FOLLOW} proposals={proposals} />
        )}
      </StoreProvider>,
    );
  });
  return host;
}

describe("a world's actions", () => {
  it("draws the main action: a link to the world's chat on the page, in words that say so", () => {
    const main = draw().querySelector("a");
    expect(main?.getAttribute("href")).toBe("#chat");
    expect(main?.textContent).toBe("Say hi in the chat");
    expect(main?.querySelector("svg[aria-hidden='true']")).not.toBeNull();
  });

  it("moves the focus to the chat's composer when the link is clicked, and leaves the focus alone when the chat has none (F2864)", () => {
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

  it("draws neither Follow nor Share with the first screen: they come a moment after it", () => {
    expect(labels(draw())).toEqual(["Say hi in the chat"]);
  });

  it("draws neither Follow nor Share on the server, where nothing is known of the browser", () => {
    const html = renderToStaticMarkup(
      <StoreProvider>
        <Actions place={PLACE} follow={FOLLOW} />
      </StoreProvider>,
    );
    expect(html).not.toMatch(/>Share</);
    expect(html).not.toMatch(/Follow/);
    expect(html).toContain("Say hi in the chat");
  });
});

const labels = (el: HTMLElement) => [...el.querySelectorAll("a, button")].map((node) => node.textContent);

// Slice 5k (frames 22 and 27): a world with a proposals realm draws 'Read the proposals' first, as a link to a plain path of this
// site; one with none draws no such button. Where the realm comes from is a hubs.json schema change, parked (F2953).
describe("a world's actions, with proposals", () => {
  it("draws 'Read the proposals' first, as a link with a hidden icon, to the realm's view", () => {
    const el = draw(PROPOSALS);
    const first = el.querySelector("a, button");
    expect(first?.textContent).toBe("Read the proposals");
    expect(first?.getAttribute("href")).toBe(PROPOSALS);
    expect(first?.querySelector("svg[aria-hidden='true']")).not.toBeNull();
  });

  it("leaves Follow and Share to a moment after the first screen, as without proposals", () => {
    expect(labels(draw(PROPOSALS))).toEqual(["Read the proposals", "Say hi in the chat"]);
  });

  // Frames 22 and 27 show the proposals first; the chat stays a click away (it is the world's core, and F2864's focus path). The
  // decision is mine, not Alexis's: it is named in the report for his review.
  it("keeps 'Say hi in the chat' after it, as a link to the chat, and makes only the proposals the solid action", () => {
    const withChat = draw(PROPOSALS);
    expect(labels(withChat)).toEqual(["Read the proposals", "Say hi in the chat"]);
    const [proposals, hi] = [...withChat.querySelectorAll("a")];
    expect(hi?.getAttribute("href")).toBe("#chat");
    expect(draw().querySelector("a[href='#chat']")?.getAttribute("data-emphasis")).toBe("solid");
    expect(proposals?.getAttribute("data-emphasis")).toBe("solid");
    expect(hi?.getAttribute("data-emphasis")).toBe("outline");
  });

  it("draws no 'Read the proposals' when the world has none, and 'Say hi' stays the solid action", () => {
    expect(draw().textContent).not.toMatch(/read the proposals/i);
    expect(draw().querySelector("a[href='#chat']")?.getAttribute("data-emphasis")).toBe("solid");
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
