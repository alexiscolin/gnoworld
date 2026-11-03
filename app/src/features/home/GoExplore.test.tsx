// @vitest-environment jsdom
import { act } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { all, mount } from "../../../tests/mount.tsx";
import { site } from "../../places.ts";
import { Hero } from "./Hero.tsx";

// "Go explore" (ADR-0003 §3) flies to the busiest world: a plain click asks where, then goes there through the router, so 7g's flight
// takes the page from the cosmos to that world. A click with a key held is the browser's, to the Earth its address names.
const where = vi.hoisted(() => ({ exploreTo: vi.fn<(places: unknown) => Promise<string>>() }));
vi.mock("./explore.ts", () => where);

function heroIn() {
  const universe = site.universeAt("/");
  const router = createMemoryRouter(
    [
      { path: "/", element: <Hero universe={universe} worlds={534} /> },
      { path: "*", element: <p>elsewhere</p> },
    ],
    { initialEntries: ["/"] },
  );
  const box = mount(<RouterProvider router={router} />);
  const explore = all(box, "a").find((link) => link.textContent === "Go explore");
  if (explore === undefined) throw new Error("no Go explore");
  return { router, explore, universe };
}

// What the click cannot act on it reports, as the browser's reportError does; jsdom has none.
const reported = vi.fn();
beforeEach(() => {
  vi.stubGlobal("reportError", reported);
});
// An answer that comes when the test says.
function answerLater() {
  const later: { with: (href: string) => void } = { with: () => undefined };
  where.exploreTo.mockImplementation(
    () =>
      new Promise((done) => {
        later.with = done;
      }),
  );
  return later;
}

afterEach(() => {
  where.exploreTo.mockReset();
  expect(reported).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});

describe("Go explore's click", () => {
  it("goes through the router to the world the presence names, asked with the page's places", async () => {
    where.exploreTo.mockResolvedValue("/w/govdao");
    const { router, explore, universe } = heroIn();
    await act(async () => {
      explore.click();
      await vi.dynamicImportSettled();
    });
    expect(router.state.location.pathname).toBe("/w/govdao");
    expect(where.exploreTo).toHaveBeenCalledWith({ earth: "/earth", worlds: universe.worlds });
  });

  it.each([{ metaKey: true }, { ctrlKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }])(
    "leaves a click %j to the browser, and asks no presence",
    async (keys) => {
      where.exploreTo.mockResolvedValue("/w/govdao");
      const { router, explore } = heroIn();
      await act(async () => {
        explore.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, ...keys }));
        await vi.dynamicImportSettled();
      });
      expect(router.state.location.pathname).toBe("/");
      expect(where.exploreTo).not.toHaveBeenCalled();
    },
  );

  it("keeps the Earth's address on the link, which a new tab opens", () => {
    const { explore } = heroIn();
    expect(explore.getAttribute("href")).toBe("/earth");
  });

  // F4507: what goes wrong between the click and the answer.
  it("goes to the Earth its address names when the answer fails", async () => {
    where.exploreTo.mockRejectedValue(new Error("the chunk did not come"));
    const { router, explore } = heroIn();
    await act(async () => {
      explore.click();
      await vi.dynamicImportSettled();
    });
    expect(router.state.location.pathname).toBe("/earth");
  });

  it("asks once for a second click while the first one's answer comes", async () => {
    const answer = answerLater();
    const { router, explore } = heroIn();
    await act(async () => {
      explore.click();
      explore.click();
      await vi.dynamicImportSettled();
    });
    expect(where.exploreTo).toHaveBeenCalledOnce();
    await act(async () => {
      answer.with("/w/govdao");
      await Promise.resolve();
    });
    expect(router.state.location.pathname).toBe("/w/govdao");
  });

  it("goes nowhere once the reader left the home before the answer came", async () => {
    const answer = answerLater();
    const { router, explore } = heroIn();
    await act(async () => {
      explore.click();
      await vi.dynamicImportSettled();
    });
    await act(async () => {
      await router.navigate("/list");
    });
    await act(async () => {
      answer.with("/w/govdao");
      await Promise.resolve();
    });
    expect(router.state.location.pathname).toBe("/list");
  });
});
