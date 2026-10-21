import { act, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { useState, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { Button } from "../Button/Button.tsx";
import { Field } from "../Field/Field.tsx";
import { eachStory, staysText } from "../testing.tsx";
import { Dialog } from "./Dialog.tsx";
import * as stories from "./Dialog.stories.tsx";

const dialog = () => screen.getByRole<HTMLDialogElement>("dialog", { hidden: true });
const STAMPS = <p>Stamps</p>;

// A dialog as a page holds it, with a close handler that flips its state, as a toggle would: a close
// the dialog reported twice would open it again.
function Held({ children = STAMPS }: { children?: ReactNode }) {
  const [open, setOpen] = useState(true);
  const [closed, setClosed] = useState(0);
  return (
    <>
      <p>Closed {closed}</p>
      <Dialog
        title="Passport"
        open={open}
        onClose={() => {
          setOpen((was) => !was);
          setClosed((n) => n + 1);
        }}
      >
        {children}
      </Dialog>
    </>
  );
}

// jsdom has no top layer: the test setup's showModal only opens the dialog. Esc, the scrim and the
// focus given back are the stories' journeys'.
describe("Dialog", () => {
  it("is a dialog named by its title, with a Close button", () => {
    render(
      <Dialog title="Register a name" open={false} onClose={vi.fn()}>
        <p>Pick a name on gno.land.</p>
      </Dialog>,
    );
    const title = screen.getByRole("heading", { name: "Register a name", hidden: true });
    expect(dialog().getAttribute("aria-labelledby")).toBe(title.id);
    expect(screen.getByRole("button", { name: "Close", hidden: true })).toBeTruthy();
  });

  it("is standard unless asked to be wide", () => {
    const { rerender } = render(
      <Dialog title="Passport" open={false} onClose={vi.fn()}>
        <p>Stamps</p>
      </Dialog>,
    );
    expect(dialog().dataset["width"]).toBe("standard");
    rerender(
      <Dialog title="Passport" open={false} onClose={vi.fn()} wide>
        <p>Stamps</p>
      </Dialog>,
    );
    expect(dialog().dataset["width"]).toBe("wide");
  });

  it("opens when asked, and closes when asked, without calling its onClose", () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <Dialog title="Passport" open={false} onClose={onClose}>
        <p>Stamps</p>
      </Dialog>,
    );
    expect(dialog().open).toBe(false);
    rerender(
      <Dialog title="Passport" open onClose={onClose}>
        <p>Stamps</p>
      </Dialog>,
    );
    expect(dialog().open).toBe(true);
    rerender(
      <Dialog title="Passport" open={false} onClose={onClose}>
        <p>Stamps</p>
      </Dialog>,
    );
    expect(dialog().open).toBe(false);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("gives the focus to its title when it has no field, a title Tab never stops on", () => {
    render(<Held />);
    const title = screen.getByRole("heading", { name: "Passport" });
    expect(document.activeElement).toBe(title);
    expect(title.tabIndex).toBe(-1);
  });

  it("gives the focus to its first field, not to a button before it", () => {
    render(
      <Held>
        <Button>Paste</Button>
        <input type="hidden" name="world" value="bubble" />
        <input aria-label="Locked" disabled />
        <Field label="Name" value="" onChange={vi.fn()} />
      </Held>,
    );
    expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "Name" }));
  });

  it("never gives the focus to a primary button, even the first thing in it", () => {
    render(
      <Held>
        <Button emphasis="solid">Sign the stamp</Button>
      </Held>,
    );
    expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Passport" }));
  });

  it("calls its onClose once from its Close button, and closes when its page says so", async () => {
    render(<Held />);
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.getByText("Closed 1")).toBeTruthy();
    expect(dialog().open).toBe(false);
  });

  // Esc asks the browser to close a modal dialog: the cancel event, which the dialog hands its page.
  const esc = () => {
    const cancel = new Event("cancel", { cancelable: true });
    act(() => {
      dialog().dispatchEvent(cancel);
    });
    return cancel;
  };

  it("asks its page on Esc, once, and closes when the page says so", () => {
    render(<Held />);
    esc();
    expect(screen.getByText("Closed 1")).toBeTruthy();
    expect(dialog().open).toBe(false);
  });

  it("stays open on Esc when its page keeps it open, the browser's own close refused", () => {
    const onClose = vi.fn();
    render(
      <Dialog title="Passport" open onClose={onClose}>
        <p>Unsaved stamps</p>
      </Dialog>,
    );
    expect(esc().defaultPrevented).toBe(true);
    expect(onClose).toHaveBeenCalledOnce();
    expect(dialog().open).toBe(true);
  });

  // A file picker dismissed inside it fires a cancel that bubbles: the picker's, not an Esc (F332).
  it("takes a cancel from a control inside it for that control's, not for Esc", () => {
    const onClose = vi.fn();
    render(
      <Dialog title="Passport" open onClose={onClose}>
        <input type="file" aria-label="A photo" />
      </Dialog>,
    );
    const cancel = new Event("cancel", { bubbles: true, cancelable: true });
    act(() => {
      screen.getByLabelText("A photo").dispatchEvent(cancel);
    });
    expect(onClose).not.toHaveBeenCalled();
    expect(cancel.defaultPrevented).toBe(false);
    expect(dialog().open).toBe(true);
  });

  // The browser closes a dialog itself on a second Esc, or for a form's dialog method (F330).
  it("tells its page when the browser closes it, and shows again while its page keeps it open", () => {
    const onClose = vi.fn();
    render(
      <Dialog title="Passport" open onClose={onClose}>
        <p>Unsaved stamps</p>
      </Dialog>,
    );
    act(() => {
      dialog().close();
    });
    expect(onClose).toHaveBeenCalledOnce();
    expect(dialog().open).toBe(true);
  });

  // Each close counts, not only the first: a page that keeps it sees it shown again every time (F347).
  it("shows again after every close the browser makes while its page keeps it open", () => {
    const onClose = vi.fn();
    render(
      <Dialog title="Passport" open onClose={onClose}>
        <p>Unsaved stamps</p>
      </Dialog>,
    );
    for (const time of [1, 2, 3]) {
      act(() => {
        dialog().close();
      });
      expect(onClose).toHaveBeenCalledTimes(time);
      expect(dialog().open).toBe(true);
    }
  });

  it("stays closed when its page agrees to the browser's close", () => {
    render(<Held />);
    act(() => {
      dialog().close();
    });
    expect(screen.getByText("Closed 1")).toBeTruthy();
    expect(dialog().open).toBe(false);
  });

  it("calls its onClose with nothing, whatever click closed it", async () => {
    const onClose = vi.fn();
    render(
      <Dialog title="Passport" open onClose={onClose}>
        <p>Stamps</p>
      </Dialog>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledExactlyOnceWith();
  });

  it("gives each dialog ids of its own, each named by its own title", () => {
    render(
      <>
        <Dialog title="Poll" open={false} onClose={vi.fn()}>
          <p>a</p>
        </Dialog>
        <Dialog title="Poll" open={false} onClose={vi.fn()}>
          <p>b</p>
        </Dialog>
      </>,
    );
    const both = screen.getAllByRole("dialog", { hidden: true });
    const named = both.map((d) => d.getAttribute("aria-labelledby"));
    expect(new Set(named).size).toBe(2);
    for (const d of both) expect(d.querySelector(`[id="${d.getAttribute("aria-labelledby") ?? ""}"]`)).not.toBeNull();
  });

  it("shows a title made of markup, or very long, as text", () => {
    staysText((text) => (
      <Dialog title={text} open={false} onClose={vi.fn()}>
        <p>{text}</p>
      </Dialog>
    ));
  });

  it("has stories standard and wide, one with a field, one opened from a button", () => {
    const shown = eachStory(stories, (container) => ({
      width: container.querySelector("dialog")?.dataset["width"],
      field: container.querySelector("dialog input") !== null,
      opener: container.querySelector(":scope > button") !== null,
    }));
    expect(shown.some((s) => s.width === "standard") && shown.some((s) => s.width === "wide")).toBe(true);
    expect(shown.some((s) => s.field)).toBe(true);
    expect(shown.some((s) => s.opener)).toBe(true);
  });
});
