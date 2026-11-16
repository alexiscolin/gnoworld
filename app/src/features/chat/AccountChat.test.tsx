// @vitest-environment jsdom
import { act } from "react";
import { Address } from "@gnoworld/schemas";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Grab, state } from "../../../tests/grabStore.tsx";
import { all, click, drawer, noMedia, noObservers } from "../../../tests/mount.tsx";
import { StoreProvider } from "../../storeContext.tsx";
import { AccountChat, type AccountChatProps } from "./AccountChat.tsx";

// D13503: a room's notification mode is chosen where the person looks for the room's own things, the dialog its name opens (the
// chevron after the name), under the rooms' list. These tests go through the page: the name's button, the mode's buttons.
const ME = Address.parse("g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5");
const ROOM = "#bubble/games";
const none = () => undefined;
const props = (over: Partial<AccountChatProps> = {}): AccountChatProps => ({
  loaded: true,
  world: "bubble",
  sections: [{ name: null, rooms: [{ room: ROOM, type: "open" }] }],
  dm: null,
  current: ROOM,
  state: undefined,
  verdicts: undefined,
  saving: false,
  chat: "connected",
  session: { kind: "in", address: ME },
  link: { current: undefined },
  dismissed: none,
  dmDismissed: none,
  sayTo: () => false,
  place: {
    slug: "bubble",
    name: "Bubble",
    description: "d",
    kicker: "k",
    home: "/",
    worlds: [],
    universe: { id: "onyx", isDefault: false, gnoweb: "https://onyx.example" },
  },
  ...over,
});
const page = (shown: boolean, over: Partial<AccountChatProps> = {}) => (
  <MemoryRouter>
    <StoreProvider>
      <Grab />
      {shown ? <AccountChat {...props(over)} /> : null}
    </StoreProvider>
  </MemoryRouter>
);
const host = () => document.body.lastElementChild as HTMLElement;
// The room's name is a button that opens its menu, a dialog; the mode's buttons are in that dialog.
const opened = async () => {
  const name = await vi.waitFor(() => {
    const found = all(host(), "button[aria-haspopup=dialog]")[0];
    if (found === undefined) throw new Error("no room name yet");
    return found;
  });
  click(name);
};
const modes = () => all(host(), "dialog [role=group] button");
const pressed = (name: string) =>
  modes()
    .find((each) => each.textContent === name)
    ?.getAttribute("aria-pressed");

describe("a room's notification mode, from the room's menu", () => {
  beforeEach(() => {
    noMedia();
    noObservers();
    // The page reads the account's links and the frames move a copy of the dock: neither is the test's.
    vi.stubGlobal("reportError", vi.fn());
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new TypeError("no network"))),
    );
  });

  it("offers the choice under the rooms, Mentions pressed by default", async () => {
    drawer()(page(true));
    await opened();
    expect([pressed("All messages"), pressed("Mentions"), pressed("Nothing")]).toEqual(["false", "true", "false"]);
  });

  it("sets the room's mode when Nothing is chosen, and shows it pressed when the menu is opened again", async () => {
    const draw = drawer();
    draw(page(true));
    await opened();
    click(modes().find((each) => each.textContent === "Nothing"));
    expect(state().noticeModes[ROOM]).toBe("none");
    draw(page(false));
    draw(page(true));
    await opened();
    expect([pressed("All messages"), pressed("Mentions"), pressed("Nothing")]).toEqual(["false", "false", "true"]);
  });

  it("says the choice is not kept when the device refuses it", async () => {
    drawer()(page(true));
    act(() => {
      state().noticeActions.begin({ modes: () => undefined, setModes: () => false });
    });
    await opened();
    expect(all(host(), "dialog").some((each) => each.textContent.includes("Not kept on this device"))).toBe(true);
  });

  it("offers no choice to a guest, for whom the store holds nothing", async () => {
    drawer()(page(true, { session: { kind: "out" } }));
    await vi.waitFor(() => {
      expect(all(host(), "button[aria-haspopup=dialog]")).toHaveLength(1);
    });
    expect(modes()).toEqual([]);
  });
});
