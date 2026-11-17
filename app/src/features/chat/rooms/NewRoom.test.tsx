// @vitest-environment jsdom
import { MemoryRouter, useLocation } from "react-router";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Grab, SignedIn } from "../../../../tests/grabStore.tsx";
import { all, button, click, mount, noMedia, noObservers, popovers, settled } from "../../../../tests/mount.tsx";
import { StoreProvider } from "../../../storeContext.tsx";
import { NewRoom } from "./NewRoom.tsx";

// The server answers a made room with 201 and { room } (server/src/rooms/routes.ts): the dialog closes on the new room, and says nothing
// of a refusal (the workshop, 2026-11-16: "the room could not be made", the room made).
const Where = () => <output data-testid="where">{useLocation().pathname + useLocation().search}</output>;

describe("making a room on the Earth", () => {
  beforeEach(() => {
    noMedia();
    noObservers();
    popovers();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("closes the dialog on the new room when the server answers 201, and says no refusal", async () => {
    const asked: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string, init?: RequestInit) => {
        asked.push(`${init?.method ?? "GET"} ${url}`);
        return Promise.resolve(
          url === "/api/rooms" && init?.method === "POST"
            ? new Response(JSON.stringify({ room: "#earth/dev" }), { status: 201 })
            : new Response("{}", { status: 404 }),
        );
      }),
    );
    const host = mount(
      <MemoryRouter initialEntries={["/earth"]}>
        <StoreProvider>
          <Grab />
          <SignedIn />
          <NewRoom />
          <Where />
        </StoreProvider>
      </MemoryRouter>,
    );
    click(button(host, "New room"));
    // The dialog's code comes at the first press.
    await settled(() => all(host, "input").length > 0);
    const box = all(host, "input")[0];
    if (box === undefined) throw new Error("no name box");
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.bind(box);
    act(() => {
      setValue?.("dev");
      box.dispatchEvent(new Event("input", { bubbles: true }));
    });
    click(button(host, "Make the room"));
    await settled(() => asked.includes("POST /api/rooms"));
    const where = () => host.querySelector("[data-testid=where]")?.textContent;
    await settled(() => where() === "/earth?room=dev" || host.textContent.includes("could not be made"));
    expect(host.textContent).not.toContain("could not be made");
    expect(where()).toBe("/earth?room=dev");
    expect(host.querySelector("dialog")?.open).toBe(false);
  });
});
