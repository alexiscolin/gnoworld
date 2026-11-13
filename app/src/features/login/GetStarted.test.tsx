// @vitest-environment jsdom
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { button, click, drawer, mount, settled } from "../../../tests/mount.tsx";
import { GetStarted } from "./GetStarted.tsx";
import { LoginControl } from "./LoginControl.tsx";
import { askGetStarted, GET_STARTED } from "./getStartedAsk.ts";

// A login with no Adena opens the steps; Adena's coming shows Connect, which is the header's login; a guest closes it.
const out = { kind: "out" } as const;
const missing = { session: out, step: "idle", problem: { reason: "missing" }, chat: "off" } as const;
afterEach(() => {
  Reflect.deleteProperty(globalThis, "adena");
});

// Adena installed while the dialog stands: the page hears it on focus, and Connect logs in once.
function connectOnceAdenaCame(box: HTMLElement, logIn: ReturnType<typeof vi.fn>): void {
  Reflect.set(globalThis, "adena", { AddEstablish: () => undefined });
  act(() => {
    window.dispatchEvent(new Event("focus"));
  });
  click(button(box, "Connect"));
  expect(logIn).toHaveBeenCalledTimes(1);
}

describe("get started", () => {
  it("opens when the login found no Adena, shows Connect when Adena appears, and logs in", async () => {
    const logIn = vi.fn();
    const box = mount(<LoginControl login={missing} logIn={logIn} />);
    await settled(() => box.querySelector("dialog[open]") !== null);
    expect(box.querySelector("dialog")?.textContent).toContain("Install Adena");
    expect(box.querySelector("dialog")?.textContent).toContain("talk in each world's chat (no wallet needed)");
    expect(button(box, "Connect")).toBeUndefined();
    connectOnceAdenaCame(box, logIn);
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

describe("GetStarted watches for Adena only while it is open", () => {
  const HERE = "Adena is here.";
  const draw = () => {
    const into = drawer();
    return (open: boolean) => {
      into(<GetStarted open={open} onClose={vi.fn()} onConnect={vi.fn()} />);
      return document.body.textContent;
    };
  };
  const adenaComes = () => {
    Reflect.set(globalThis, "adena", { AddEstablish: () => undefined });
  };
  const focus = () => {
    act(() => {
      window.dispatchEvent(new Event("focus"));
    });
  };

  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("reads again at the window's focus and every two seconds while open", () => {
    const show = draw();
    expect(show(true)).not.toContain(HERE);
    adenaComes();
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(document.body.textContent).toContain(HERE);
  });

  it("reads at the focus while open", () => {
    const show = draw();
    show(true);
    adenaComes();
    focus();
    expect(document.body.textContent).toContain(HERE);
  });

  it("reads nothing while closed: the focus and the poll of a dialog never opened find nothing", () => {
    const show = draw();
    show(false);
    adenaComes();
    focus();
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(show(true)).not.toContain(HERE);
  });

  it("stops its focus listener and its poll when closed", () => {
    const removed = vi.spyOn(window, "removeEventListener");
    const cleared = vi.spyOn(globalThis, "clearInterval");
    const show = draw();
    show(true);
    show(false);
    expect(removed).toHaveBeenCalledWith("focus", expect.any(Function));
    expect(cleared).toHaveBeenCalledTimes(1);
    adenaComes();
    focus();
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(show(true)).not.toContain(HERE);
    removed.mockRestore();
    cleared.mockRestore();
  });
});

describe("the dialog Get started, opened and closed from the control", () => {
  const none = { session: out, step: "idle", problem: undefined, chat: "off" } as const;
  const isOpen = (box: HTMLElement) => box.querySelector("dialog[open]") !== null;

  it("opens at the welcome card's ask, and stops hearing it once the control is gone", async () => {
    const removed = vi.spyOn(window, "removeEventListener");
    const draw = drawer();
    draw(<LoginControl login={none} logIn={vi.fn()} />);
    expect(isOpen(document.body)).toBe(false);
    act(() => {
      askGetStarted();
    });
    await settled(() => isOpen(document.body));
    draw(null);
    expect(removed).toHaveBeenCalledWith(GET_STARTED, expect.any(Function));
    removed.mockRestore();
  });

  it("closes on Connect, and logs in", async () => {
    const logIn = vi.fn();
    const box = mount(<LoginControl login={missing} logIn={logIn} />);
    await settled(() => isOpen(box));
    connectOnceAdenaCame(box, logIn);
    await settled(() => !isOpen(box));
  });

  it("stays shut when the missing Adena is no longer the problem after a guest closed it", async () => {
    const draw = drawer();
    draw(<LoginControl login={missing} logIn={vi.fn()} />);
    await settled(() => isOpen(document.body));
    click(button(document.body, "Continue as a guest"));
    await settled(() => !isOpen(document.body));
    draw(<LoginControl login={none} logIn={vi.fn()} />);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(isOpen(document.body)).toBe(false);
  });
});
