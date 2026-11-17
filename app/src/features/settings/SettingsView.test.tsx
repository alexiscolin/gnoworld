// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { mountInStore } from "../../../tests/inStore.tsx";
import { modals, one } from "../../../tests/mount.tsx";
import { SettingsView } from "./SettingsView.tsx";

// The settings are ui's whole-screen sheet on a phone (wide="screen", which only a phone draws as one), the wide dialog on a computer.
modals();
afterEach(() => {
  vi.unstubAllGlobals();
});
const widthOn = async (phone: boolean) => {
  vi.stubGlobal("matchMedia", () => ({ matches: phone, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  const { box } = await mountInStore(<SettingsView open onClose={() => undefined} />);
  return one(box, "dialog").dataset["width"];
};

describe("the settings' dialog", () => {
  it("is the whole-screen sheet on a phone", async () => {
    expect(await widthOn(true)).toBe("screen");
  });

  it("stays the wide dialog on a computer", async () => {
    expect(await widthOn(false)).toBe("wide");
  });
});
