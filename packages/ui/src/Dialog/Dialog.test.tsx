import { act, fireEvent, render, screen } from "@testing-library/react";
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

// The element that takes the focus when the dialog opens with these before its Name field.
function focusedPast(before: ReactNode) {
  render(<Held>{[before, <Field key="name" label="Name" value="" onChange={vi.fn()} />]}</Held>);
  return document.activeElement;
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

  // 4c's UX review (U5): what the dialog asks about, read with its title by assistive technology.
  it("is described by its description, when it has one", () => {
    render(
      <>
        <Dialog title="Delete message?" description="the first line" open={false} onClose={vi.fn()}>
          <p>It leaves #games for everyone.</p>
        </Dialog>
        <Dialog title="Your passport" open={false} onClose={vi.fn()}>
          <p>Stamps</p>
        </Dialog>
      </>,
    );
    const [described, plain] = screen.getAllByRole("dialog", { hidden: true });
    const id = described?.getAttribute("aria-describedby") ?? "";
    expect(document.getElementById(id)?.textContent).toBe("the first line");
    expect(plain?.hasAttribute("aria-describedby")).toBe(false);
    expect(plain?.querySelectorAll("p")).toHaveLength(1);
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

  it("wears a mark before its heading when given one", () => {
    render(
      <Dialog title="Passport" open={false} onClose={vi.fn()} lead={<i data-testid="seal" />}>
        Body
      </Dialog>,
    );
    expect(dialog().querySelector("[data-testid='seal']")).not.toBeNull();
    expect(dialog().querySelector("h2")?.textContent).toBe("Passport");
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

  // The first field the browser can focus, never a button-typed input: one hidden by CSS cannot take it (F367).
  it.each([
    ["a submit input", <input key="i" type="submit" value="Send" />],
    ["an image input", <input key="i" type="image" alt="Send" src="data:," />],
    ["a button input", <input key="i" type="button" value="Paste" />],
    ["a reset input", <input key="i" type="reset" value="Clear" />],
    [
      "a field in a hidden section",
      <div key="i" hidden>
        <input aria-label="Draft" />
      </div>,
    ],
    ["a field hidden by its style", <input key="i" aria-label="Draft" style={{ display: "none" }} />],
    ["a box no one may edit", <div key="i" contentEditable={false} />],
  ])("gives the focus to the first visible field, past %s before it", (_, before) => {
    expect(focusedPast(before)).toBe(screen.getByRole("textbox", { name: "Name" }));
  });

  // A text area and a select are fields too, the first one focused (F367).
  it.each([
    ["a text area", <textarea key="f" aria-label="First" />, "textbox"],
    // The composer of slice 4 may be an editable box rather than a text area (F390).
    [
      "an editable box",
      <div key="f" role="textbox" aria-label="First" contentEditable suppressContentEditableWarning />,
      "textbox",
    ],
    [
      "a select",
      <select key="f" aria-label="First">
        <option>Onyx</option>
      </select>,
      "combobox",
    ],
  ] as const)("gives the focus to %s when it is the first field", (_, first, role) => {
    expect(focusedPast(first)).toBe(screen.getByRole(role, { name: "First" }));
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

  // A press beside the dialog lands on the dialog element itself (the backdrop's), outside its box.
  const boxed = () => {
    vi.spyOn(dialog(), "getBoundingClientRect").mockReturnValue({
      left: 100,
      right: 600,
      top: 100,
      bottom: 500,
    } as DOMRect);
  };
  const press = (down: Element, at: { clientX: number; clientY: number }) => {
    fireEvent.pointerDown(down, at);
    fireEvent.click(dialog(), at);
  };

  it("closes on a press beside it, once, as Close does", () => {
    render(<Held />);
    boxed();
    press(dialog(), { clientX: 20, clientY: 20 });
    expect(screen.getByText("Closed 1")).toBeTruthy();
    expect(dialog().open).toBe(false);
  });

  it("stays open when a press starts inside it and ends beside it, a selection dragged out, or lands inside its box", () => {
    render(<Held />);
    boxed();
    press(screen.getByText("Stamps"), { clientX: 20, clientY: 20 });
    press(dialog(), { clientX: 300, clientY: 300 });
    expect(screen.getByText("Closed 0")).toBeTruthy();
    expect(dialog().open).toBe(true);
  });

  it("asks its page on Esc, once, and closes when the page says so", () => {
    render(<Held />);
    esc();
    expect(screen.getByText("Closed 1")).toBeTruthy();
    expect(dialog().open).toBe(false);
  });

  // 9k (answer 9f-1, F5856): the kicker above the title, in the one label style, read with the description.
  it("draws its kicker above its title in the label style, and says it in its description before the description", () => {
    render(
      <Dialog
        title="Pick a name"
        kicker="YOUR GNO.LAND NAME"
        description="Kept by r/sys/namereg"
        open
        onClose={vi.fn()}
      >
        <p>Body</p>
      </Dialog>,
    );
    const kicker = screen.getByText("YOUR GNO.LAND NAME");
    const title = screen.getByRole("heading", { name: "Pick a name" });
    expect(kicker.classList.contains("label")).toBe(true);
    expect(kicker.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const said = (dialog().getAttribute("aria-describedby") ?? "")
      .split(" ")
      .map((id) => document.getElementById(id)?.textContent);
    expect(said).toEqual(["YOUR GNO.LAND NAME", "Kept by r/sys/namereg"]);
    expect(dialog().getAttribute("aria-labelledby")).toBe(title.id);
  });

  // F5973, F5965: the kicker is the Kicker component in a wrapper that carries the description's id, and it stays with the
  // title in a stack of its own, tighter than the one that holds the description and the body.
  it("draws its kicker with the Kicker component, grouped with the title apart from the description and the body", () => {
    render(
      <Dialog title="Pick a name" kicker="YOUR NAME" description="Kept by namereg" open onClose={vi.fn()}>
        <p>Body</p>
      </Dialog>,
    );
    const wrapper = document.getElementById((dialog().getAttribute("aria-describedby") ?? "").split(" ")[0] ?? "");
    expect(wrapper?.querySelector("p.label")?.textContent).toBe("YOUR NAME");
    expect(wrapper?.className).toContain("kicker");
    expect(dialog().className).toContain("dialog");
    expect(screen.getByText("Kept by namereg").className).toContain("description");
    const head = wrapper?.parentElement;
    expect(head?.contains(screen.getByRole("heading", { name: "Pick a name" }))).toBe(true);
    expect(head?.contains(screen.getByText("Kept by namereg"))).toBe(false);
    expect(head?.contains(screen.getByText("Body"))).toBe(false);
  });

  it("is described by its kicker alone when it has no description, and draws no kicker unless given one", () => {
    const { rerender } = render(
      <Dialog title="Pick a name" kicker="YOUR NAME" open onClose={vi.fn()}>
        <p>Body</p>
      </Dialog>,
    );
    expect(document.getElementById(dialog().getAttribute("aria-describedby") ?? "")?.textContent).toBe("YOUR NAME");
    rerender(
      <Dialog title="Pick a name" open onClose={vi.fn()}>
        <p>Body</p>
      </Dialog>,
    );
    expect(dialog().hasAttribute("aria-describedby")).toBe(false);
    expect(document.querySelector("dialog .label")).toBeNull();
  });

  it("draws nothing for an empty kicker, and leaves it out of its description", () => {
    render(
      <Dialog title="Pick" kicker="" open onClose={vi.fn()}>
        <p>Body</p>
      </Dialog>,
    );
    expect(document.querySelector("dialog .label")).toBeNull();
    expect(dialog().hasAttribute("aria-describedby")).toBe(false);
  });

  it("shows a kicker made of markup, or very long, as text", () => {
    staysText((text) => (
      <Dialog title="Pick" kicker={text} open={false} onClose={vi.fn()}>
        <p>Body</p>
      </Dialog>
    ));
  });

  // 9k (F5868): another way out is drawn (the name dialog's Later); Esc still asks the page.
  it("draws no Close button when asked, and Esc still asks its page to close", () => {
    const { rerender } = render(
      <Dialog title="Passport" open onClose={vi.fn()}>
        <p>Stamps</p>
      </Dialog>,
    );
    expect(screen.getByRole("button", { name: "Close" })).toBeTruthy();
    const onClose = vi.fn();
    rerender(
      <Dialog title="Passport" hideClose open onClose={onClose}>
        <p>Stamps</p>
      </Dialog>,
    );
    expect(screen.queryByRole("button", { name: "Close", hidden: true })).toBeNull();
    expect(screen.queryAllByRole("button", { hidden: true })).toHaveLength(0);
    const cancel = esc();
    expect(cancel.defaultPrevented).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("keeps the focus on its field with Close hidden, and closes on Esc", async () => {
    function Opener() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <Button
            onClick={() => {
              setOpen(true);
            }}
          >
            Open
          </Button>
          <Dialog
            title="Pick"
            hideClose
            open={open}
            onClose={() => {
              setOpen(false);
            }}
          >
            <Field label="Name" value="" onChange={vi.fn()} />
          </Dialog>
        </>
      );
    }
    render(<Opener />);
    await userEvent.click(screen.getByRole("button", { name: "Open" }));
    expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "Name" }));
    esc();
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

  // React passes a close up from a dialog inside it: that close is the inner dialog's (F352, F332's class).
  it("is not closed by a dialog inside it closing", () => {
    const onClose = vi.fn();
    render(
      <Dialog title="Passport" open onClose={onClose}>
        <Dialog title="A stamp" open onClose={vi.fn()}>
          <p>Bubble, 2026-10-21</p>
        </Dialog>
      </Dialog>,
    );
    act(() => {
      document.querySelectorAll("dialog")[1]?.close();
    });
    expect(onClose).not.toHaveBeenCalled();
  });

  // A browser queues the close event of its own close(): one still queued when its page opens it again is
  // not the browser closing it (F361).
  it("takes the close event of its own close for none of the browser's, even after it opens again", () => {
    const onClose = vi.fn();
    const shut = (open: boolean) => (
      <Dialog title="Passport" open={open} onClose={onClose}>
        <p>Unsaved stamps</p>
      </Dialog>
    );
    const { rerender } = render(shut(true));
    const queued: Event[] = [];
    dialog().close = function (this: HTMLDialogElement) {
      this.open = false;
      queued.push(new Event("close"));
    };
    rerender(shut(false));
    rerender(shut(true));
    act(() => {
      for (const event of queued) dialog().dispatchEvent(event);
    });
    expect(queued).toHaveLength(1);
    expect(onClose).not.toHaveBeenCalled();
    expect(dialog().open).toBe(true);
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
      kicker: container.querySelector("dialog .label") !== null,
      noClose: container.querySelector("dialog") !== null && container.querySelector("dialog button") === null,
      width: container.querySelector("dialog")?.dataset["width"],
      field: container.querySelector("dialog input") !== null,
      opener: container.querySelector(":scope > button") !== null,
    }));
    expect(shown.some((s) => s.width === "standard") && shown.some((s) => s.width === "wide")).toBe(true);
    expect(shown.some((s) => s.field)).toBe(true);
    expect(shown.some((s) => s.opener)).toBe(true);
    expect(shown.some((s) => s.kicker)).toBe(true);
    expect(shown.some((s) => s.noClose)).toBe(true);
  });
});
