// @vitest-environment jsdom
import { act } from "react";
import { beforeEach, describe, expect, it } from "vitest";
import { all, one, settled } from "../../../tests/mount.tsx";
import { mountInStore } from "../../../tests/inStore.tsx";
import { DisplaySection } from "./DisplaySection.tsx";

// The reader's language, chosen among Jarvis's by each one's name in itself, and the switch that stops the automatic translations.
beforeEach(() => {
  localStorage.clear();
});

describe("the translation settings", () => {
  it("offers the languages by their own names, English chosen by default, and the switch on", async () => {
    const { box } = await mountInStore(<DisplaySection />);
    const select = one(box, "select[aria-label='Language']") as HTMLSelectElement;
    const names = all(select, "option").map((each) => each.textContent);
    expect(names).toContain("français");
    expect(names).toContain("Deutsch");
    expect(names).toHaveLength(16);
    expect(select.value).toBe("en");
    const label = all(box, "label").find((each) => each.textContent === "Translate messages automatically");
    expect((one(box, `#${label?.getAttribute("for") ?? "none"}`) as HTMLInputElement).checked).toBe(true);
  });

  it("keeps the language and the switch on the device", async () => {
    const { box, store } = await mountInStore(<DisplaySection />);
    const select = one(box, "select[aria-label='Language']") as HTMLSelectElement;
    act(() => {
      select.value = "fr";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await settled(() => store.getState().device.settings.language === "fr");
    const label = all(box, "label").find((each) => each.textContent === "Translate messages automatically");
    act(() => {
      label?.click();
    });
    await settled(() => !store.getState().device.settings.autoTranslate);
    expect(JSON.parse(localStorage.getItem("gnoworld:device:settings") ?? "{}")).toMatchObject({
      language: "fr",
      autoTranslate: false,
    });
  });
});
