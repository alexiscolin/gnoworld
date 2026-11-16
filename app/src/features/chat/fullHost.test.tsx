// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ChatProps } from "./Chat.tsx";

vi.mock("./Chat.tsx", async () => {
  const { usePlacePage } = await import("./placePage.ts");
  return { Chat: () => <p data-testid="chat">{usePlacePage()}</p> };
});
const asked = vi.hoisted(() => ({ full: false, going: false, phone: false }));
vi.mock("./full.ts", () => ({
  asksFull: (params: URLSearchParams) => params.get("chat") === "full",
  useChatAlone: () => asked.full,
}));

vi.mock("./phoneGo.ts", () => ({ usePhoneGo: () => asked.going }));
vi.mock("./useMedia.ts", () => ({ DOCKED: "(min-width: 1280px)", useMedia: () => asked.phone }));

const { chatHeld, DockedChatHost } = await import("./fullHost.tsx");
const { PlaceChat } = await import("./PlaceChat.tsx");

const chatOf = (slug: string): ChatProps => ({
  world: slug,
  place: { slug, name: slug } as unknown as ChatProps["place"],
});

// The shared setup: a mounted root, a draw with the dock's host beside, an unmount, the browser's stubs.
const mount = () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement("div");
  document.body.append(host);
  return createRoot(host);
};
const render = (root: Root, node: ReactNode) => {
  act(() => {
    root.render(node);
  });
};
const unmount = (root: Root) => {
  act(() => {
    root.unmount();
  });
};
const withHost = (chat: ReactNode) => (
  <>
    <DockedChatHost />
    {chat}
  </>
);
const stubBrowser = () => {
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
};
const seatedChat = (root: Root, chat: ChatProps, plate?: ReactNode) => {
  render(root, withHost(<PlaceChat chat={chat} plate={plate} page={(dock) => <section>{dock}</section>} />));
};
const chatText = () => document.querySelector("[data-testid=chat]")?.textContent;

describe("the dock's chat that heals itself", () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it("comes back when its seat was taken out of the dock's box", () => {
    const root = mount();
    const show = (chat: ChatProps) => {
      render(root, withHost(<PlaceChat chat={chat} page={(dock) => <section data-testid="dock">{dock}</section>} />));
    };
    show(chatOf("a"));
    expect(document.querySelector("[data-testid=dock] [data-testid=chat]")).not.toBeNull();
    document.querySelector("[data-chat-seat]")?.remove();
    expect(document.querySelector("[data-testid=chat]")).toBeNull();
    show(chatOf("a"));
    expect(document.querySelector("[data-testid=dock] [data-testid=chat]")).not.toBeNull();
    unmount(root);
  });

  it("is whole again after a hot update re-runs the module and its components remount", async () => {
    const root = mount();
    const draw = (mod: typeof import("./fullHost.tsx") & typeof import("./PlaceChat.tsx"), chat: ChatProps) => {
      render(
        root,
        <>
          <mod.DockedChatHost />
          <mod.PlaceChat chat={chat} page={(dock) => <section data-testid="dock">{dock}</section>} />
        </>,
      );
    };
    draw({ ...(await import("./fullHost.tsx")), ...(await import("./PlaceChat.tsx")) }, chatOf("a"));
    expect(document.querySelector("[data-testid=dock] [data-testid=chat]")).not.toBeNull();
    vi.resetModules();
    draw({ ...(await import("./fullHost.tsx")), ...(await import("./PlaceChat.tsx")) }, chatOf("a"));
    expect(document.querySelectorAll("[data-testid=dock] [data-testid=chat]")).toHaveLength(1);
    unmount(root);
  });
});

describe("the page the route hands to the chat alone", () => {
  afterEach(() => {
    asked.full = false;
    document.body.replaceChildren();
  });

  const drawn = (plate?: ReactNode) => {
    asked.full = true;
    const root = mount();
    render(root, withHost(<PlaceChat chat={chatOf("a")} plate={plate} page={() => null} />));
    return root;
  };

  it("provides the plate to the chat drawn alone", () => {
    const root = drawn(<b data-plate>the plate</b>);
    expect(document.querySelector("[data-plate]")?.textContent).toBe("the plate");
    unmount(root);
  });

  it("gives none when the route has no plate", () => {
    const root = drawn();
    expect(document.querySelector("[data-plate]")).toBeNull();
    unmount(root);
  });
});

describe("the plate goes with its chat", () => {
  afterEach(() => {
    asked.full = false;
    document.body.replaceChildren();
  });

  it("gives no new plate to the old chat while the next place's chat loads", () => {
    asked.full = true;
    const root = mount();
    const show = (chat: ChatProps | undefined, plate: string) => {
      render(root, withHost(<PlaceChat chat={chat} plate={<b>{plate}</b>} page={() => null} />));
    };
    show(chatOf("a"), "plate of a");
    expect(chatText()).toBe("plate of a");
    show(undefined, "plate of b");
    expect(chatText()).toBe("plate of a");
    show(chatOf("b"), "plate of b");
    expect(chatText()).toBe("plate of b");
    unmount(root);
  });

  it("gives a docked chat no plate from the full one before", () => {
    const root = mount();
    const show = (full: boolean) => {
      asked.full = full;
      seatedChat(root, chatOf("a"), <b>its plate</b>);
    };
    show(true);
    expect(chatText()).toBe("its plate");
    show(false);
    expect(chatText()).toBe("");
    unmount(root);
  });
});

describe("the chat alone while the place's chat cannot be drawn", () => {
  afterEach(() => {
    asked.full = false;
    vi.unstubAllGlobals();
    document.body.replaceChildren();
  });

  const show = (chat: ChatProps | undefined, failed?: ReactNode) => {
    stubBrowser();
    asked.full = true;
    const root = mount();
    const draw = (next: ChatProps | undefined, why?: ReactNode) => {
      render(root, withHost(<PlaceChat chat={next} failed={why} page={() => null} />));
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
    unmount(root);
  });

  it("stands a skeleton where no chat is held yet, and none once one is", async () => {
    // The page before let its chat go in a microtask.
    await Promise.resolve();
    const { draw, root } = show(undefined);
    expect(document.querySelector("[data-chat-skeleton]")).not.toBeNull();
    draw(chatOf("a"));
    expect(document.querySelector("[data-chat-skeleton]")).toBeNull();
    unmount(root);
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
    stubBrowser();
    vi.resetModules();
    const mod = await import("./fullHost.tsx");
    // markFullEarly's replaceState, after the module's load.
    history.replaceState(null, "", "/w/x?chat=full");
    asked.full = true;
    const root = mount();
    render(root, <mod.FullChatHost />);
    expect(document.querySelector("[data-chat-skeleton]")).not.toBeNull();
    unmount(root);
  });

  it("draws none for a chat expanded from its dock after the first draw", async () => {
    stubBrowser();
    vi.resetModules();
    const mod = await import("./fullHost.tsx");
    const root = mount();
    render(root, <mod.FullChatHost />);
    // The click on the expand control, after the first draw.
    history.replaceState(null, "", "/w/x?chat=full");
    asked.full = true;
    render(root, <mod.FullChatHost />);
    expect(document.querySelector("[data-chat-skeleton]")).toBeNull();
    unmount(root);
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

describe("a page a phone is being sent away from", () => {
  afterEach(() => {
    asked.going = false;
    asked.phone = false;
    asked.full = false;
    document.body.replaceChildren();
  });

  const draw = (page: () => ReactNode) => {
    const root = mount();
    render(root, withHost(<PlaceChat chat={chatOf("a")} page={page} />));
    return root;
  };

  it("draws neither its page nor its chat while it goes", async () => {
    asked.phone = true;
    asked.going = true;
    const page = vi.fn(() => <section data-testid="page" />);
    const root = draw(page);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(page).not.toHaveBeenCalled();
    expect(document.querySelector("[data-testid=chat]")).toBeNull();
    unmount(root);
  });

  it("draws its page once the phone's code is here, when it stays", async () => {
    asked.phone = true;
    const root = draw(() => <section data-testid="page" />);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(document.querySelector("[data-testid=page]")).not.toBeNull();
    unmount(root);
  });

  it("draws its page when it stays", () => {
    const root = draw(() => <section data-testid="page" />);
    expect(document.querySelector("[data-testid=page]")).not.toBeNull();
    unmount(root);
  });
});

describe("the shell's chat once no page holds it", () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it("is let go once the last page that held it has left", async () => {
    const root = mount();
    const show = (chat: ChatProps | undefined) => {
      if (chat === undefined) render(root, withHost(null));
      else seatedChat(root, chat);
    };
    show(chatOf("a"));
    expect(chatHeld()).toBe(true);
    show(undefined);
    await act(async () => {
      await Promise.resolve();
    });
    expect(chatHeld()).toBe(false);
    unmount(root);
  });
});
