// @vitest-environment jsdom
import { Address } from "@gnoworld/schemas";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router";
import { beforeAll, describe, expect, it } from "vitest";
import { StoreProvider, useAppStore } from "../../storeContext.tsx";
import { RoomsList } from "./RoomsList.tsx";

const EARTH = [{ name: null, rooms: [{ room: "#earth", type: "open" as const }] }];
const BUBBLE = [{ name: null, rooms: [{ room: "#bubble", type: "open" as const }] }];

// The account is signed in as the page renders, before the list reads the store.
function SignIn({ on }: { on: boolean }) {
  const store = useAppStore();
  if (on) store.getState().loginActions.signedIn(Address.parse("g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5"));
  return null;
}
const list = (sections: typeof EARTH, signedIn: boolean) => {
  const host = document.body.appendChild(document.createElement("div"));
  act(() => {
    createRoot(host).render(
      <MemoryRouter>
        <StoreProvider>
          <SignIn on={signedIn} />
          <RoomsList sections={sections} current="#earth" />
        </StoreProvider>
      </MemoryRouter>,
    );
  });
  return host.querySelector('[aria-label="New room"]') !== null;
};

describe("the Earth's rooms list", () => {
  // jsdom has no popovers, which every button's tooltip toggles.
  beforeAll(() => {
    HTMLElement.prototype.togglePopover = () => true;
  });

  it("holds the New room button for an account, never for a guest or another world", () => {
    expect(list(EARTH, true)).toBe(true);
    expect(list(EARTH, false)).toBe(false);
    expect(list(BUBBLE, true)).toBe(false);
  });
});
