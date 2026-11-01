// @vitest-environment jsdom
import { Address } from "@gnoworld/schemas";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { button, click, mount, one } from "../../../tests/mount.tsx";
import { keepCountry, keptCountry } from "../../lib/country.ts";
import { CountryChoice } from "./CountryChoice.tsx";

// 7j: the opt-in (ADR-0001 §7): off until the person chooses, and the time zone only ever suggests. Nothing here decides for them: every
// test of a suggestion reads the device to see that it stayed empty until they confirmed.
const ME = Address.parse("g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5");
const OTHER = Address.parse("g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv");

const inZone = (timeZone: string) =>
  vi
    .spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions")
    .mockReturnValue({ ...new Intl.DateTimeFormat().resolvedOptions(), timeZone });
const list = (box: HTMLElement) => one(box, "select") as HTMLSelectElement;
const says = (box: HTMLElement) => one(box, "[role='status']").textContent;
const opened = (box: HTMLElement) => {
  click(button(box, "Choose a country"));
};
function pick(box: HTMLElement, code: string) {
  const select = list(box);
  act(() => {
    select.value = code;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

// The suggestion taken on a device that refuses to keep it.
function refused() {
  const refusal = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("full");
  });
  const box = mount(<CountryChoice account={ME} />);
  opened(box);
  click(button(box, "Use Japan"));
  return { box, refusal };
}

beforeEach(() => {
  inZone("Asia/Tokyo");
});
afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("the choice of a country", () => {
  it("is off to begin with: no country, no list, the time zone not read", () => {
    const zone = vi.spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions");
    zone.mockClear();
    const box = mount(<CountryChoice account={ME} />);
    expect(says(box)).toBe("Your messages show no country.");
    expect(box.querySelector("select")).toBeNull();
    expect(zone).not.toHaveBeenCalled();
    expect(keptCountry(ME)).toBeUndefined();
  });

  it("suggests the time zone's country once asked, and keeps nothing", () => {
    const box = mount(<CountryChoice account={ME} />);
    opened(box);
    expect(button(box, "Use Japan")).toBeDefined();
    expect(list(box).value).toBe("");
    expect(keptCountry(ME)).toBeUndefined();
  });

  it("takes the focus to the list it opens: the control asked from is gone", () => {
    const box = mount(<CountryChoice account={ME} />);
    opened(box);
    expect(document.activeElement).toBe(list(box));
  });

  it("leaves the focus where it is when it opens on a choice already made: a closed menu holds it too", () => {
    keepCountry(ME, "JP");
    const box = mount(<CountryChoice account={ME} />);
    expect(document.activeElement).not.toBe(list(box));
  });

  it("suggests again once a choice is taken back", () => {
    keepCountry(ME, "JP");
    const box = mount(<CountryChoice account={ME} />);
    pick(box, "");
    expect(button(box, "Use Japan")).toBeDefined();
  });

  it("takes the suggestion only when the person confirms it", () => {
    const box = mount(<CountryChoice account={ME} />);
    opened(box);
    click(button(box, "Use Japan"));
    expect(keptCountry(ME)).toBe("JP");
    expect(list(box).value).toBe("JP");
    expect(button(box, "Use Japan")).toBeUndefined();
  });

  it("offers no suggestion for a time zone no country holds", () => {
    inZone("UTC");
    const box = mount(<CountryChoice account={ME} />);
    opened(box);
    expect(box.textContent).not.toContain("Use ");
    expect(list(box).value).toBe("");
  });

  it("lists every country by name, in name order, none first", () => {
    const box = mount(<CountryChoice account={ME} />);
    opened(box);
    const names = [...list(box).options].map(({ text }) => text);
    const [none, ...countries] = names;
    expect(none).toBe("No country");
    expect(countries).toHaveLength(250);
    expect(countries).toEqual(countries.toSorted((a, b) => a.localeCompare(b)));
    expect(new Set(countries).size).toBe(250);
  });

  it("pairs each name with its own code: the name read is the country sent", () => {
    const box = mount(<CountryChoice account={ME} />);
    opened(box);
    const code = (name: string) => [...list(box).options].find(({ text }) => text === name)?.value;
    expect(code("France")).toBe("FR");
    expect(code("Japan")).toBe("JP");
    expect(code("No country")).toBe("");
  });

  it("keeps a country taken from the list, and says what it means", () => {
    const box = mount(<CountryChoice account={ME} />);
    opened(box);
    pick(box, "FR");
    expect(keptCountry(ME)).toBe("FR");
    expect(says(box)).toContain("France");
    expect(says(box)).toContain("public rooms");
  });

  it("takes it back with No country", () => {
    keepCountry(ME, "FR");
    const box = mount(<CountryChoice account={ME} />);
    pick(box, "");
    expect(keptCountry(ME)).toBeUndefined();
    expect(says(box)).toBe("Your messages show no country.");
    expect(list(box).value).toBe("");
  });

  it("opens on the country this account chose", () => {
    keepCountry(ME, "JP");
    expect(list(mount(<CountryChoice account={ME} />)).value).toBe("JP");
  });

  it("shows another account's choice to no one: each account has its own", () => {
    keepCountry(OTHER, "JP");
    expect(mount(<CountryChoice account={ME} />).querySelector("select")).toBeNull();
  });

  it("follows the account: the next one to log in sees nothing of the last one's choice", () => {
    keepCountry(ME, "JP");
    const host = document.createElement("div");
    const root = createRoot(host);
    act(() => {
      root.render(<CountryChoice account={ME} />);
    });
    expect(list(host).value).toBe("JP");
    act(() => {
      root.render(<CountryChoice account={OTHER} />);
    });
    expect(host.querySelector("select")).toBeNull();
    expect(says(host)).toBe("Your messages show no country.");
    act(() => {
      root.unmount();
    });
  });

  it("says so when the device does not keep the choice, and does not claim it", () => {
    const { box } = refused();
    expect(box.textContent).toContain("Not kept on this device");
    expect(list(box).value).toBe("");
    expect(says(box)).toBe("Your messages show no country.");
  });

  it("takes the words back once the device keeps a later choice", () => {
    const { box, refusal } = refused();
    refusal.mockRestore();
    click(button(box, "Use Japan"));
    expect(box.textContent).not.toContain("Not kept on this device");
    expect(keptCountry(ME)).toBe("JP");
  });

  it("names its list for a screen reader", () => {
    const box = mount(<CountryChoice account={ME} />);
    opened(box);
    expect(list(box).getAttribute("aria-label")).toBe("Your country");
  });
});
