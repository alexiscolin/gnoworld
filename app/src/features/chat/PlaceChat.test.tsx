// @vitest-environment jsdom
import { act } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { afterEach, expect, it, vi } from "vitest";
import type { ChatProps } from "./Chat.tsx";

vi.mock("./Chat.tsx", () => ({ Chat: () => <p data-testid="chat" /> }));
const lets = vi.hoisted(() => ({ gone: 0 }));
vi.mock("./dock/FullChatHost.tsx", async (original) => {
  const real = await original<typeof import("./dock/FullChatHost.tsx")>();
  return {
    ...real,
    hold: (held: Parameters<typeof real.hold>[0]) => {
      if (held === undefined) lets.gone += 1;
      real.hold(held);
    },
  };
});

const { PlaceChat } = await import("./PlaceChat.tsx");
const chat: ChatProps = { world: "x", place: { slug: "x", name: "x" } as unknown as ChatProps["place"] };

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

it("hydrates a place on a phone without unmounting it: the shell's chat is never let go", async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal("matchMedia", () => ({
    matches: true,
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
  const tree = (
    <MemoryRouter initialEntries={["/w/x?chat=full"]}>
      <PlaceChat chat={chat} page={() => <main />} />
    </MemoryRouter>
  );
  const host = document.createElement("div");
  host.append(...new DOMParser().parseFromString(renderToString(tree), "text/html").body.childNodes);
  document.body.append(host);
  await act(async () => {
    hydrateRoot(host, tree);
    await new Promise((done) => setTimeout(done, 50));
  });
  expect(lets.gone).toBe(0);
});
