// @vitest-environment jsdom
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { button, click, mount, settled } from "../../../tests/mount.tsx";
import { LoginControl } from "./LoginControl.tsx";

// A login with no Adena opens the steps; Adena's coming shows Connect, which is the header's login; a guest closes it.
const out = { kind: "out" } as const;
const missing = { session: out, step: "idle", problem: { reason: "missing" }, chat: "off" } as const;
afterEach(() => {
  Reflect.deleteProperty(globalThis, "adena");
});

describe("get started", () => {
  it("opens when the login found no Adena, shows Connect when Adena appears, and logs in", async () => {
    const logIn = vi.fn();
    const box = mount(<LoginControl login={missing} logIn={logIn} />);
    await settled(() => box.querySelector("dialog[open]") !== null);
    expect(box.querySelector("dialog")?.textContent).toContain("Install Adena");
    expect(box.querySelector("dialog")?.textContent).toContain("talk in each world's chat (no wallet needed)");
    expect(button(box, "Connect")).toBeUndefined();
    Reflect.set(globalThis, "adena", { AddEstablish: () => undefined });
    act(() => {
      window.dispatchEvent(new Event("focus"));
    });
    click(button(box, "Connect"));
    expect(logIn).toHaveBeenCalledTimes(1);
  });

  it("closes as a guest, and opens again from the button; with no problem it stays shut", async () => {
    const box = mount(<LoginControl login={missing} logIn={vi.fn()} />);
    await settled(() => box.querySelector("dialog[open]") !== null);
    click(button(box, "Continue as a guest"));
    await settled(() => box.querySelector("dialog[open]") === null);
    click(button(box, "Install Adena"));
    await settled(() => box.querySelector("dialog[open]") !== null);
    const fine = mount(
      <LoginControl login={{ session: out, step: "idle", problem: undefined, chat: "off" }} logIn={vi.fn()} />,
    );
    expect(fine.querySelector("dialog")).toBeNull();
  });
});
