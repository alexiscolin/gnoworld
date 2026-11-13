// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { asksFull, withFull } from "./full.ts";
import { dmHref, dmParams, roomHref, roomParams } from "./names.ts";
import { hydrateAt } from "../../../tests/hydrate.tsx";
import type { ChatProps } from "./Chat.tsx";

vi.mock("./Chat.tsx", () => ({ Chat: () => null }));

window.matchMedia = (query: string) =>
  ({
    matches: false,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }) as unknown as MediaQueryList;
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe = () => undefined;
    disconnect = () => undefined;
  },
);
// The address as the visitor opened it, read once when the host's module loads.
window.history.replaceState(null, "", "/earth?chat=full");

const { DockedChatHost, FullChatHost, PlaceChat } = await import("./fullHost.tsx");

const chat = { world: "a", place: { slug: "a", name: "a" } as unknown as ChatProps["place"] } satisfies ChatProps;
const tree = (
  <>
    <FullChatHost />
    <DockedChatHost />
    <PlaceChat chat={chat} page={(dock) => <section data-testid="dock">{dock}</section>} />
  </>
);

// The build writes each page once, from an address with no search; a shared link with `?chat=full` hydrates that file (React's error #418
// on every such page: the first client draw was the full chat's, the file's the docked page's).
describe("a page opened full, hydrated from the file the build wrote", () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it("first draws what the file holds, so React finds no mismatch", () => {
    const { host, errors } = hydrateAt(tree, "/earth", "/earth?chat=full");
    expect(errors).toEqual([]);
    expect(host.querySelector("[data-testid=dock]")).toBeNull();
  });
});

// 5q's fix pass, review 1: the full chat lives in the address (?chat=full), and every link that changes the room keeps it.
describe("the full chat in the address", () => {
  it("is asked for by ?chat=full alone", () => {
    expect(asksFull(new URLSearchParams("chat=full"))).toBe(true);
    expect(asksFull(new URLSearchParams("chat=dock"))).toBe(false);
    expect(asksFull(new URLSearchParams("room=games"))).toBe(false);
  });

  it("adds and takes off the choice, keeping the rest of the search", () => {
    expect(withFull(new URLSearchParams("room=games"), true).toString()).toBe("room=games&chat=full");
    expect(withFull(new URLSearchParams("room=games&chat=full"), false).toString()).toBe("room=games");
  });

  it("keeps the choice in a room's and a conversation's address, and leaves it out otherwise", () => {
    expect(roomHref("#bubble/games")).toBe("/w/bubble?room=games");
    expect(roomHref("#bubble/games", true)).toBe("/w/bubble?room=games&chat=full");
    expect(roomHref("#bubble")).toBe("/w/bubble");
    expect(roomHref("#bubble", true)).toBe("/w/bubble?chat=full");
    expect(dmHref("bubble", "g1abc")).toBe("/w/bubble?dm=g1abc");
    expect(dmHref("bubble", "g1abc", true)).toBe("/w/bubble?dm=g1abc&chat=full");
    expect(roomParams("#bubble/games", true).toString()).toBe("room=games&chat=full");
    expect(dmParams("g1abc", true).toString()).toBe("dm=g1abc&chat=full");
  });
});
