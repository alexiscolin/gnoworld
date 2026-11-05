// @vitest-environment jsdom
import { Address } from "@gnoworld/schemas";
import { act } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { mountInStore } from "../../../tests/inStore.tsx";
import { all, popovers, settled } from "../../../tests/mount.tsx";
import { AccountMenu } from "./AccountMenu.tsx";

// The header's menu (slice 8, 8a; ADR-0002 §1, Menu and settings): the passport and the settings for every visitor, the saved messages for
// an account; it never logs out, and the login's own control (tier 1) stays mounted beside it in every session.
vi.mock("../login/index.ts", () => ({ LoginControl: () => <p data-login="">login</p> }));
const ALICE = Address.parse("g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv");

beforeAll(popovers);
beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined })),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
});

async function opened(address?: Address) {
  const { box, store } = await mountInStore(<AccountMenu />);
  if (address !== undefined)
    act(() => {
      store.setState({ login: { ...store.getState().login, session: { kind: "in", address } } });
    });
  expect(all(box, "[data-login]")).toHaveLength(1);
  const trigger = all(box, "button").find((each) =>
    /^(Menu|Your account)$/.test(each.getAttribute("aria-label") ?? each.textContent),
  );
  expect(trigger).toBeDefined();
  act(() => {
    trigger?.click();
  });
  await settled(() => all(document, "[role='menuitem']").length > 0);
  return { box, items: all(document, "[role='menuitem']").map((item) => item.textContent.trim()) };
}

describe("the header's menu", () => {
  it("offers a guest the passport and the settings, and the login stays beside it", async () => {
    const { box, items } = await opened();
    expect(items).toEqual(["Passport", "Settings"]);
    expect(all(box, "[data-login]")).toHaveLength(1);
  });

  it("offers an account its saved messages too, and never a way to log out", async () => {
    const { box, items } = await opened(ALICE);
    expect(items).toEqual(["Passport", "Saved", "Settings"]);
    expect(items.some((item) => /log ?out/i.test(item))).toBe(false);
    expect(all(box, "[data-login]")).toHaveLength(1);
  });
});
