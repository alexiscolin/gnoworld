// @vitest-environment jsdom
import { act } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mount, settled } from "../../../tests/mount.tsx";
import type { UniverseView } from "../../places.ts";
import { SEARCH } from "../../scene/openEvent.ts";
import { SearchPalette } from "./SearchPalette.tsx";

// The search drawer opened from outside the header (F5462): a full Plan's "+N" asks it, as an event, open on the namespace's words; each
// ask starts from its own words, whatever the last one typed.
vi.mock("./SearchDrawer.tsx", () => ({
  default: ({ open, start }: { open: boolean; start?: string }) =>
    open ? <p data-drawer="" data-start={start ?? ""} /> : null,
}));

const universe = {} as UniverseView;
const drawer = () => document.querySelector<HTMLElement>("[data-drawer]");
const ask = (query: string) => {
  act(() => {
    window.dispatchEvent(new CustomEvent(SEARCH, { detail: query }));
  });
};

afterEach(() => {
  document.body.replaceChildren();
});

describe("the search drawer asked from the page", () => {
  it("opens on the words it is asked, each time on its own", async () => {
    const router = createMemoryRouter([{ path: "/", element: <SearchPalette universe={universe} /> }]);
    mount(<RouterProvider router={router} />);
    expect(drawer()).toBeNull();
    ask("gnoswap");
    await settled(() => drawer() !== null);
    expect(drawer()?.dataset["start"]).toBe("gnoswap");
    ask("samcrew");
    await settled(() => drawer()?.dataset["start"] === "samcrew");
    expect(drawer()?.dataset["start"]).toBe("samcrew");
  });

  it("takes no words that are not text", async () => {
    const router = createMemoryRouter([{ path: "/", element: <SearchPalette universe={universe} /> }]);
    mount(<RouterProvider router={router} />);
    act(() => {
      window.dispatchEvent(new CustomEvent(SEARCH, { detail: { evil: true } }));
    });
    await settled(() => drawer() !== null);
    expect(drawer()?.dataset["start"]).toBe("");
  });

  // G3: the button and the chord open on no words, after a Plan's ask too.
  it("opens on no words from its button after a Plan asked it on its own", async () => {
    const router = createMemoryRouter([{ path: "/", element: <SearchPalette universe={universe} /> }]);
    const box = mount(<RouterProvider router={router} />);
    ask("gnoswap");
    await settled(() => drawer()?.dataset["start"] === "gnoswap");
    act(() => {
      box.querySelector<HTMLButtonElement>("button[aria-label='Search']")?.click();
    });
    await settled(() => drawer()?.dataset["start"] === "");
    expect(drawer()?.dataset["start"]).toBe("");
  });
});
