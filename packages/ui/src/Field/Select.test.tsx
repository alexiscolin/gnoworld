// @vitest-environment jsdom
import { act, createRef } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Select, type SelectProps } from "./Select.tsx";

// The browser's own list, for a choice of many fixed rows, where a phone's picker does better than ours (7j, a country).
const OPTIONS = [
  { value: "", label: "No country" },
  { value: "FR", label: "France" },
  { value: "JP", label: "Japan" },
];
const hosts: HTMLElement[] = [];

function drawn(over: Partial<SelectProps> = {}) {
  const host = document.createElement("div");
  document.body.append(host);
  hosts.push(host);
  act(() => {
    createRoot(host).render(
      <Select label="Your country" value="" onChange={() => undefined} options={OPTIONS} {...over} />,
    );
  });
  const select = host.querySelector("select");
  if (select === null) throw new Error("no list drawn");
  return select;
}

afterEach(() => {
  for (const host of hosts.splice(0)) host.remove();
});

describe("Select", () => {
  it("is named, for what stands above it says it to the eye alone", () => {
    expect(drawn().getAttribute("aria-label")).toBe("Your country");
  });

  it("draws each option with its own value, in the order given", () => {
    expect([...drawn().options].map(({ value, text }) => [value, text])).toEqual([
      ["", "No country"],
      ["FR", "France"],
      ["JP", "Japan"],
    ]);
  });

  it("shows the value it is given", () => {
    expect(drawn({ value: "JP" }).value).toBe("JP");
  });

  it("gives the value chosen", () => {
    const onChange = vi.fn();
    const select = drawn({ onChange });
    act(() => {
      select.value = "FR";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(onChange).toHaveBeenCalledExactlyOnceWith("FR");
  });

  it("lends its element, for a caller that moves the focus to it", () => {
    const ref = createRef<HTMLSelectElement>();
    expect(drawn({ ref })).toBe(ref.current);
  });
});
