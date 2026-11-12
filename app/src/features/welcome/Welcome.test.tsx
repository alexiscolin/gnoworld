// @vitest-environment jsdom
import type { Address } from "@gnoworld/schemas";
import { useEffect } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { button, click, mount, noMedia, settled } from "../../../tests/mount.tsx";
import { StoreProvider, useAppStore } from "../../storeContext.tsx";
import { WelcomeSlot } from "./WelcomeSlot.tsx";

// the welcome card shows once, at a first visit of a logged-out reader on a page of space; any use of it keeps it away for good.
const KEY = "gnoworld:welcomed";
vi.mock("../../later.ts", () => ({ useAfterLoad: () => true }));

// The session the reader's store holds, set as the page mounts.
function As({ who }: { who: "out" | "in" }) {
  const store = useAppStore();
  useEffect(() => {
    const { signedOut, signedIn } = store.getState().loginActions;
    if (who === "out") signedOut();
    else signedIn("g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5" as Address);
  }, [store, who]);
  return null;
}

function page(who: "out" | "in" = "out") {
  const router = createMemoryRouter([{ path: "*", element: <WelcomeSlot /> }], { initialEntries: ["/earth"] });
  return mount(
    <StoreProvider>
      <As who={who} />
      <RouterProvider router={router} />
    </StoreProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  noMedia();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("welcome card", () => {
  it("shows at a first visit, and after a button or the close a new load does not", async () => {
    const box = page();
    await settled(() => box.querySelector("[data-open]") !== null);
    click(button(box, "Get started"));
    expect(localStorage.getItem(KEY)).toBe("1");
    const again = page();
    await new Promise((done) => setTimeout(done, 20));
    expect(again.querySelector("[data-open]")).toBeNull();
  });

  it("offers Connect Adena in place of Get started to a visitor who has Adena", async () => {
    vi.stubGlobal("adena", { AddEstablish: () => undefined });
    const box = page();
    await settled(() => box.querySelector("[data-open]") !== null);
    expect(button(box, "Connect Adena")).toBeDefined();
    expect(button(box, "Get started")).toBeUndefined();
    vi.unstubAllGlobals();
  });

  it("closes with the close button, for good", async () => {
    const box = page();
    await settled(() => box.querySelector("[data-open]") !== null);
    click(button(box, "Close"));
    expect(box.querySelector("[data-open]")).toBeNull();
    expect(localStorage.getItem(KEY)).toBe("1");
  });

  it("never shows to a logged-in reader", async () => {
    const box = page("in");
    await new Promise((done) => setTimeout(done, 20));
    expect(box.querySelector("[data-open]")).toBeNull();
  });

  it("shows nothing when the storage throws", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const box = page();
    await new Promise((done) => setTimeout(done, 20));
    expect(box.querySelector("[data-open]")).toBeNull();
  });
});
