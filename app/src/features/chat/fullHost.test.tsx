// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ChatProps } from "./Chat.tsx";

vi.mock("./Chat.tsx", () => ({ Chat: () => <p data-testid="chat">chat</p> }));
const asked = vi.hoisted(() => ({ full: false }));
vi.mock("./full.ts", () => ({ asksFull: () => asked.full, useChatAlone: () => asked.full }));

const { DockedChatHost, PlaceChat } = await import("./fullHost.tsx");

const chatOf = (slug: string): ChatProps => ({
  world: slug,
  place: { slug, name: slug } as unknown as ChatProps["place"],
});

describe("the dock's chat that heals itself", () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it("comes back when its seat was taken out of the dock's box", () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const show = (chat: ChatProps) => {
      act(() => {
        root.render(
          <>
            <DockedChatHost />
            <PlaceChat chat={chat} page={(dock) => <section data-testid="dock">{dock}</section>} />
          </>,
        );
      });
    };
    show(chatOf("a"));
    expect(host.querySelector("[data-testid=dock] [data-testid=chat]")).not.toBeNull();
    document.querySelector("[data-chat-seat]")?.remove();
    expect(host.querySelector("[data-testid=chat]")).toBeNull();
    show(chatOf("a"));
    expect(host.querySelector("[data-testid=dock] [data-testid=chat]")).not.toBeNull();
    act(() => {
      root.unmount();
    });
  });

  it("is whole again after a hot update re-runs the module and its components remount", async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const draw = (mod: typeof import("./fullHost.tsx"), chat: ChatProps) => {
      act(() => {
        root.render(
          <>
            <mod.DockedChatHost />
            <mod.PlaceChat chat={chat} page={(dock) => <section data-testid="dock">{dock}</section>} />
          </>,
        );
      });
    };
    draw(await import("./fullHost.tsx"), chatOf("a"));
    expect(host.querySelector("[data-testid=dock] [data-testid=chat]")).not.toBeNull();
    vi.resetModules();
    draw(await import("./fullHost.tsx"), chatOf("a"));
    expect(host.querySelectorAll("[data-testid=dock] [data-testid=chat]")).toHaveLength(1);
    act(() => {
      root.unmount();
    });
  });
});

// A page asked with the chat full (`?chat=full`, a shared link) is drawn on the server first, where no document is: the shell's chat host
// draws nothing there, and never reads the page to copy a dock's screen (it threw "document is not defined", a 500).
describe("the shell's chat host, drawn on the server", () => {
  afterEach(() => {
    asked.full = false;
    vi.unstubAllGlobals();
  });

  it("draws a page asked with the chat full, with no document to read", async () => {
    asked.full = true;
    vi.resetModules();
    const server = await import("./fullHost.tsx");
    vi.stubGlobal("document", undefined);
    expect(() => renderToString(<server.DockedChatHost />)).not.toThrow();
  });
});
