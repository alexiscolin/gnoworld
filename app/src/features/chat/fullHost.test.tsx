// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ChatProps } from "./Chat.tsx";

vi.mock("./Chat.tsx", async () => {
  const { usePlacePage } = await import("./placePage.ts");
  return { Chat: () => <p data-testid="chat">{usePlacePage()}</p> };
});
const asked = vi.hoisted(() => ({ full: false }));
vi.mock("./full.ts", () => ({
  asksFull: (params: URLSearchParams) => params.get("chat") === "full",
  useChatAlone: () => asked.full,
}));

vi.mock("./phoneGo.ts", () => ({ usePhoneGo: () => false }));

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

describe("the page the route hands to the chat alone", () => {
  afterEach(() => {
    asked.full = false;
    document.body.replaceChildren();
  });

  const drawn = (plate?: ReactNode) => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    asked.full = true;
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    act(() => {
      root.render(
        <>
          <DockedChatHost />
          <PlaceChat chat={chatOf("a")} plate={plate} page={() => null} />
        </>,
      );
    });
    return root;
  };

  it("provides the plate to the chat drawn alone", () => {
    const root = drawn(<b data-plate>the plate</b>);
    expect(document.querySelector("[data-plate]")?.textContent).toBe("the plate");
    act(() => {
      root.unmount();
    });
  });

  it("gives none when the route has no plate", () => {
    const root = drawn();
    expect(document.querySelector("[data-plate]")).toBeNull();
    act(() => {
      root.unmount();
    });
  });
});

describe("the plate goes with its chat", () => {
  afterEach(() => {
    asked.full = false;
    document.body.replaceChildren();
  });

  it("gives no new plate to the old chat while the next place's chat loads", () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    asked.full = true;
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const show = (chat: ChatProps | undefined, plate: string) => {
      act(() => {
        root.render(
          <>
            <DockedChatHost />
            <PlaceChat chat={chat} plate={<b>{plate}</b>} page={() => null} />
          </>,
        );
      });
    };
    show(chatOf("a"), "plate of a");
    expect(document.querySelector("[data-testid=chat]")?.textContent).toBe("plate of a");
    show(undefined, "plate of b");
    expect(document.querySelector("[data-testid=chat]")?.textContent).toBe("plate of a");
    show(chatOf("b"), "plate of b");
    expect(document.querySelector("[data-testid=chat]")?.textContent).toBe("plate of b");
    act(() => {
      root.unmount();
    });
  });

  it("gives a docked chat no plate from the full one before", () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const show = (full: boolean) => {
      asked.full = full;
      act(() => {
        root.render(
          <>
            <DockedChatHost />
            <PlaceChat chat={chatOf("a")} plate={<b>its plate</b>} page={(dock) => <section>{dock}</section>} />
          </>,
        );
      });
    };
    show(true);
    expect(document.querySelector("[data-testid=chat]")?.textContent).toBe("its plate");
    show(false);
    expect(document.querySelector("[data-testid=chat]")?.textContent).toBe("");
    act(() => {
      root.unmount();
    });
  });
});

describe("the chat alone while the place's chat cannot be drawn", () => {
  afterEach(() => {
    asked.full = false;
    vi.unstubAllGlobals();
    document.body.replaceChildren();
  });

  const show = (chat: ChatProps | undefined, failed?: ReactNode) => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.stubGlobal("matchMedia", () => ({
      matches: false,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe = () => undefined;
        disconnect = () => undefined;
      },
    );
    asked.full = true;
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const draw = (next: ChatProps | undefined, why?: ReactNode) => {
      act(() => {
        root.render(
          <>
            <DockedChatHost />
            <PlaceChat chat={next} failed={why} page={() => null} />
          </>,
        );
      });
    };
    draw(chat, failed);
    return { draw, root };
  };

  it("draws the failure, with its retry, and lets the old chat go", () => {
    const { draw, root } = show(chatOf("a"));
    expect(document.querySelector("[data-testid=chat]")).not.toBeNull();
    draw(undefined, <button type="button">Retry</button>);
    expect(document.querySelector("[data-chat-failed] button")?.textContent).toBe("Retry");
    expect(document.querySelector("[data-testid=chat]")).toBeNull();
    act(() => {
      root.unmount();
    });
  });

  it("stands a skeleton where no chat is held yet, and none once one is", async () => {
    // The page before let its chat go in a microtask.
    await Promise.resolve();
    const { draw, root } = show(undefined);
    expect(document.querySelector("[data-chat-skeleton]")).not.toBeNull();
    draw(chatOf("a"));
    expect(document.querySelector("[data-chat-skeleton]")).toBeNull();
    act(() => {
      root.unmount();
    });
  });
});

describe("the skeleton of a page opened full", () => {
  afterEach(() => {
    asked.full = false;
    vi.unstubAllGlobals();
    history.replaceState(null, "", "/");
    document.body.replaceChildren();
  });

  it("reads the address when first drawn, after a phone's address was rewritten at load", async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.stubGlobal("matchMedia", () => ({
      matches: false,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe = () => undefined;
        disconnect = () => undefined;
      },
    );
    vi.resetModules();
    const mod = await import("./fullHost.tsx");
    // markFullEarly's replaceState, after the module's load.
    history.replaceState(null, "", "/w/x?chat=full");
    asked.full = true;
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    act(() => {
      root.render(<mod.FullChatHost />);
    });
    expect(document.querySelector("[data-chat-skeleton]")).not.toBeNull();
    act(() => {
      root.unmount();
    });
  });
});

// A page asked with the chat full (`?chat=full`, a shared link) is drawn on the server first, where no document is: the shell's chat host
// draws nothing there, and never reads the page to copy a dock's screen (it would throw "document is not defined", a 500).
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
