// @vitest-environment jsdom
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount, settled } from "../../../tests/mount.tsx";
import { StoreProvider } from "../../storeContext.tsx";
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
});
