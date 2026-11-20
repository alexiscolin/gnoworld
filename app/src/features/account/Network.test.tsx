// @vitest-environment jsdom
import { act } from "react";
import { MemoryRouter } from "react-router";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { mount, settled } from "../../../tests/mount.tsx";
import { Network } from "./Network.tsx";

// The network named right of the login button is a menu of the networks (D13501): Onyx and gno.land, the current one checked, "Testnet" kept
// on Onyx; choosing another reloads the page on that network's home (D14004), so its worlds, rooms and scene start whole. No chain is read.
const chain = vi.hoisted(() => ({ readPage: vi.fn() }));
vi.mock("../../lib/chain/rpc.ts", async (original) => ({
  ...(await original<object>()),
  readPage: chain.readPage,
}));
const assign = vi.fn<(path: string) => void>();

beforeAll(() => {
  Object.assign(HTMLElement.prototype, { showPopover: () => undefined, hidePopover: () => undefined });
  vi.stubGlobal("reportError", vi.fn());
  vi.stubGlobal("location", { assign, origin: "http://localhost" });
});
beforeEach(() => {
  chain.readPage.mockReset();
  assign.mockReset();
});

const calling = <T extends Element>(find: () => T | null | undefined) => {
  const one = find();
  if (!one) throw new Error("not drawn");
  return one;
};
const trigger = (box: HTMLElement) => calling(() => box.querySelector<HTMLButtonElement>("button"));
const radios = () => [...document.querySelectorAll<HTMLElement>("[role='menuitemradio']")];
const radio = (name: string) => calling(() => radios().find((each) => each.textContent.startsWith(name)));

// The menu's code comes at the first press of the name, and opens in its place.
async function draw(path: string, inPill = false) {
  const box = mount(
    <MemoryRouter initialEntries={[path]}>
      <Network
        name={path.startsWith("/net/gnoland") ? "gno.land" : "Onyx"}
        testnet={!path.startsWith("/net/gnoland")}
        inPill={inPill}
      />
    </MemoryRouter>,
  );
  act(() => {
    trigger(box).click();
  });
  await settled(() => radios().length > 0);
  return box;
}
const choose = async (name: string) => {
  act(() => {
    radio(name).click();
  });
  await tick();
};

// One real tick inside act, so a promise settled by the test reaches its `.then` before what follows is checked.
const tick = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
  });

describe("the network control", () => {
  it.each([false, true])(
    "lists both networks with the current one checked, Testnet kept on Onyx (in a pill: %s)",
    async (inPill) => {
      const box = await draw("/w/bubble", inPill);
      expect(trigger(box).getAttribute("aria-haspopup")).toBe("menu");
      expect(radios().map((each) => each.textContent)).toEqual([expect.stringContaining("Onyx"), "gno.land"]);
      expect(radio("Onyx").textContent).toContain("Testnet");
      expect(radio("Onyx").getAttribute("aria-checked")).toBe("true");
      expect(radio("gno.land").getAttribute("aria-checked")).toBe("false");
    },
  );

  it("checks gno.land when one is on it", async () => {
    await draw("/net/gnoland");
    expect(radio("gno.land").getAttribute("aria-checked")).toBe("true");
    expect(radio("Onyx").getAttribute("aria-checked")).toBe("false");
  });

  it("reloads the page on gno.land's home from any place, asking no chain", async () => {
    await draw("/r/gov/dao");
    await choose("gno.land");
    expect(assign.mock.calls).toEqual([["/net/gnoland"]]);
    expect(chain.readPage).not.toHaveBeenCalled();
  });

  it("reloads the page on Onyx's home as /, never /net/onyx", async () => {
    await draw("/net/gnoland/earth");
    await choose("Onyx");
    expect(assign.mock.calls).toEqual([["/"]]);
  });

  it("stays put for the network one is on", async () => {
    await draw("/w/bubble");
    await choose("Onyx");
    expect(assign).not.toHaveBeenCalled();
  });
});
