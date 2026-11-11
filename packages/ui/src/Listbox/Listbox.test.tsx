// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Listbox } from "./Listbox.tsx";

const OPTIONS = [
  { id: "l-0", label: "/me", hint: "Send an action" },
  { id: "l-1", label: "/poll" },
];
const hosts: HTMLElement[] = [];

function drawn(active: number, onPick = vi.fn()) {
  const host = document.createElement("div");
  document.body.append(host);
  hosts.push(host);
  act(() => {
    createRoot(host).render(<Listbox label="Suggestions" id="l" options={OPTIONS} active={active} onPick={onPick} />);
  });
  return host;
}

afterEach(() => {
  for (const host of hosts.splice(0)) host.remove();
});

describe("Listbox", () => {
  it("is a named listbox of options, the picked one marked, each with the id it was given", () => {
    const options = [...drawn(1).querySelectorAll("[role='option']")];
    expect(drawn(1).querySelector("[role='listbox']")?.getAttribute("aria-label")).toBe("Suggestions");
    expect(options.map((option) => option.id)).toEqual(["l-0", "l-1"]);
    expect(options.map((option) => option.getAttribute("aria-selected"))).toEqual(["false", "true"]);
    expect(options[0]?.textContent).toBe("/meSend an action");
  });

  it("picks an option on a press, which keeps the focus where it was", () => {
    const onPick = vi.fn();
    const host = drawn(0, onPick);
    const press = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
    act(() => {
      host.querySelectorAll("[role='option']")[1]?.dispatchEvent(press);
    });
    expect(onPick).toHaveBeenCalledWith("l-1");
    expect(press.defaultPrevented).toBe(true);
  });
});
