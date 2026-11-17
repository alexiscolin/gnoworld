// @vitest-environment jsdom
import { MemoryRouter } from "react-router";
import { act } from "react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { modals, mount, settled } from "../../../tests/mount.tsx";
import { askFor } from "../../pageAsks.ts";
import { StoreProvider } from "../../storeContext.tsx";
import { DeviceViews } from "./DeviceViews.tsx";
import { Views } from "./Views.tsx";

describe("the device's views", () => {
  beforeEach(() => {
    // jsdom has no reportError, where a navigation's failure goes.
    vi.stubGlobal("reportError", vi.fn());
  });

  it("opens the saved messages from the menu's Saved: the dialog drawn, not a lazy component wrapped in a second lazy one", async () => {
    // The place's address as the account menu's Saved leaves it.
    mount(
      <MemoryRouter initialEntries={["/earth#saved"]}>
        <StoreProvider>
          <Views universe="onyx" />
        </StoreProvider>
      </MemoryRouter>,
    );
    await settled(() => document.body.textContent.includes("Saved messages"));
    expect(document.body.textContent).toContain("Saved on this device only.");
  });

  beforeAll(modals);

  it("opens the command line's login (D13880) at #key-login, a link to it opening it too", async () => {
    mount(
      <MemoryRouter initialEntries={["/earth#key-login"]}>
        <StoreProvider>
          <Views universe="onyx" />
        </StoreProvider>
      </MemoryRouter>,
    );
    await settled(() => document.querySelector("dialog[open]")?.textContent.includes("Log in with gnokey") === true);
    expect(document.querySelector("dialog[open]")?.textContent).toContain("Your key signs a code offline");
  });

  it("opens it when Get started asks, from any place", async () => {
    mount(
      <MemoryRouter initialEntries={["/earth"]}>
        <StoreProvider>
          <DeviceViews universe="onyx" />
        </StoreProvider>
      </MemoryRouter>,
    );
    act(() => {
      askFor("key-login");
    });
    await settled(() => document.querySelector("dialog[open]")?.textContent.includes("Log in with gnokey") === true);
    expect(document.querySelector("dialog[open]")?.textContent).toContain("Your key signs a code offline");
  });
});
