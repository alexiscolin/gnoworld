// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { hydrateAt } from "../tests/hydrate.tsx";
import { site } from "./places.ts";
import { AppLinks } from "./routerLink.tsx";
import { ShellHeader } from "./shellHeader.tsx";
import { StoreProvider } from "./storeContext.tsx";

vi.stubGlobal(
  "ResizeObserver",
  class {
    observe = () => undefined;
    disconnect = () => undefined;
    unobserve = () => undefined;
  },
);
HTMLElement.prototype.togglePopover = () => false;
vi.stubGlobal("reportError", () => undefined);
window.matchMedia = (query: string) =>
  ({
    matches: false,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }) as unknown as MediaQueryList;

const header = (
  <StoreProvider>
    <AppLinks>
      <ShellHeader universe={site.universeAt("/")} />
    </AppLinks>
  </StoreProvider>
);

// A path no page is written for (a world that is not there) is served the page written at `/`, whose header holds the Earth: that
// draw hydrates it, and the path's own comes right after (React's error #418 on /w/nowhere, a text that differed).
describe("a not-found path, hydrated from the page written at /", () => {
  afterEach(() => {
    document.body.replaceChildren();
    delete document.documentElement.dataset["written"];
  });

  it("first draws the header the file holds, so React finds no mismatch", () => {
    document.documentElement.dataset["written"] = "/";
    const { host, errors } = hydrateAt(header, "/", "/w/nowhere");
    expect(errors).toEqual([]);
    expect(host.textContent).toContain("nowhere");
  });
});
