import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { eachStory, staysText } from "../testing.tsx";
import { Field } from "./Field.tsx";
import * as stories from "./Field.stories.tsx";

describe("Field", () => {
  it("is a text box named by its label, described by its help", () => {
    render(<Field label="Room name" help="Up to 32 letters" value="" onChange={vi.fn()} />);
    const box = screen.getByRole("textbox", { name: "Room name" });
    expect(box.getAttribute("type")).toBe("text");
    expect(box.getAttribute("aria-describedby")).toBe(screen.getByText("Up to 32 letters").id);
  });

  // What the box is about, said elsewhere on the page (a composer's reply bar), describes it after its help.
  it("is described by the elements named, after its help", () => {
    render(
      <>
        <p id="about">Replying to Alice</p>
        <Field label="Message" help="Enter sends" describedBy="about" value="" onChange={vi.fn()} />
      </>,
    );
    const said = (screen.getByRole("textbox", { name: "Message" }).getAttribute("aria-describedby") ?? "")
      .split(" ")
      .map((id) => document.getElementById(id)?.textContent);
    expect(said).toEqual(["Enter sends", "Replying to Alice"]);
  });

  it("says its error, as invalid and described by it, beside its help", () => {
    render(<Field label="Name" help="On gno.land" error="Taken already" value="x" onChange={vi.fn()} />);
    const box = screen.getByRole("textbox", { name: "Name" });
    expect(box.getAttribute("aria-invalid")).toBe("true");
    const said = (box.getAttribute("aria-describedby") ?? "")
      .split(" ")
      .map((id) => document.getElementById(id)?.textContent);
    expect(said).toEqual(["On gno.land", "Taken already"]);
  });

  // A region inserted already filled may not be announced (F177's class): it waits on the page (F335),
  // and names its field, the error read alone tying it to none (F356).
  it("keeps a status region for its error from the start, and says the error there when it comes", () => {
    const { rerender } = render(<Field label="Name" value="x" onChange={vi.fn()} />);
    const region = screen.getByRole("status");
    expect(region.textContent).toBe("");
    rerender(<Field label="Name" error="Taken already" value="x" onChange={vi.fn()} />);
    expect(screen.getByRole("status")).toBe(region);
    expect(region.textContent).toBe("Name: Taken already");
    rerender(<Field label="Name" value="xy" onChange={vi.fn()} />);
    expect(screen.getByRole("status")).toBe(region);
    expect(region.textContent).toBe("");
  });

  // The region says it; the one shown only describes the box, or a screen reader reads it twice (F348).
  it("says its error once: the one shown is out of the reading order, still describing the box", () => {
    render(<Field label="Name" error="Taken already" value="x" onChange={vi.fn()} />);
    const shown = document.getElementById(screen.getByRole("textbox").getAttribute("aria-describedby") ?? "");
    expect(shown?.textContent).toBe("Taken already");
    expect(shown?.getAttribute("aria-hidden")).toBe("true");
    const read = screen.getAllByText(/Taken already/).filter((said) => said.getAttribute("aria-hidden") !== "true");
    expect(read).toEqual([screen.getByRole("status")]);
  });

  it("is described by its error alone when it has no help", () => {
    render(<Field label="Name" error="Too short" value="ab" onChange={vi.fn()} />);
    const said = screen.getByRole("textbox").getAttribute("aria-describedby") ?? "";
    expect(said.split(" ").map((id) => document.getElementById(id)?.textContent)).toEqual(["Too short"]);
  });

  it("is a search box, or a date and time, when asked", () => {
    const { rerender } = render(<Field kind="search" label="Search" value="" onChange={vi.fn()} />);
    expect(screen.getByRole("searchbox", { name: "Search" })).toBeTruthy();
    rerender(<Field kind="date" label="Starts" value="2026-10-21T18:00" onChange={vi.fn()} />);
    expect(screen.getByLabelText("Starts").getAttribute("type")).toBe("datetime-local");
  });

  // A box of several lines (slice 4's multiline, docs/decisions.md row 255): Enter submits its form, Shift+Enter
  // adds a line, as a chat's box does; an Enter that ends a composition (an input method's) submits nothing.
  it("is a box of several lines when asked, named by its label and described by its help", () => {
    render(<Field kind="lines" label="Message" help="Shift+Enter adds a line" value="" onChange={vi.fn()} />);
    const box = screen.getByRole("textbox", { name: "Message" });
    expect(box.tagName).toBe("TEXTAREA");
    expect(box.getAttribute("aria-describedby")).toBe(screen.getByText("Shift+Enter adds a line").id);
  });

  it("is valid with no error, invalid with one, and takes Enter outside a form without failing", async () => {
    const { rerender } = render(<Field kind="lines" label="Message" value="" onChange={vi.fn()} />);
    const box = screen.getByRole("textbox", { name: "Message" });
    expect(box.getAttribute("aria-invalid")).toBeNull();
    await userEvent.type(box, "{Enter}");
    rerender(<Field kind="lines" label="Message" value="" error="No" onChange={vi.fn()} />);
    expect(screen.getByRole("textbox", { name: "Message" }).getAttribute("aria-invalid")).toBe("true");
  });

  // A box of lines in a form that submits nothing but a count, its value kept as it is typed from `value`.
  function formOf(props: { enterAddsLine?: boolean; value?: string } = {}) {
    const submitted = vi.fn((event: SubmitEvent) => {
      event.preventDefault();
    });
    function Form() {
      const [value, setValue] = useState(props.value ?? "");
      return (
        <form
          onSubmit={(event) => {
            submitted(event.nativeEvent);
          }}
        >
          <Field kind="lines" enterAddsLine={props.enterAddsLine} label="Message" value={value} onChange={setValue} />
        </form>
      );
    }
    render(<Form />);
    return { submitted, box: screen.getByRole("textbox", { name: "Message" }) };
  }

  it("submits its form on Enter, and adds a line on Shift+Enter", async () => {
    const { submitted, box } = formOf();
    await userEvent.type(box, "one{Shift>}{Enter}{/Shift}two");
    expect(box).toHaveProperty("value", "one\ntwo");
    expect(submitted).not.toHaveBeenCalled();
    await userEvent.type(box, "{Enter}");
    expect(submitted).toHaveBeenCalledTimes(1);
    expect(box).toHaveProperty("value", "one\ntwo");
  });

  it("submits nothing on the Enter that ends an input method's composition", () => {
    const { submitted, box } = formOf({ value: "か" });
    // Not prevented either: the input method still takes the key.
    expect(fireEvent.keyDown(box, { key: "Enter", isComposing: true })).toBe(true);
    expect(submitted).not.toHaveBeenCalled();
  });

  // F1713 (CR1): Safari sends the Enter that confirms a candidate after compositionend, isComposing false, keyCode 229.
  it("submits nothing on a Safari composition's Enter: keyCode 229 with isComposing false, or while composing", () => {
    const { submitted, box } = formOf({ value: "か" });
    expect(fireEvent.keyDown(box, { key: "Enter", keyCode: 229, isComposing: false })).toBe(true);
    fireEvent.compositionStart(box);
    expect(fireEvent.keyDown(box, { key: "Enter", keyCode: 13, isComposing: false })).toBe(true);
    expect(submitted).not.toHaveBeenCalled();
    // Once the composition ended, an Enter of the key itself sends.
    fireEvent.compositionEnd(box);
    expect(fireEvent.keyDown(box, { key: "Enter", keyCode: 13, isComposing: false })).toBe(false);
    expect(submitted).toHaveBeenCalledTimes(1);
  });

  // F1714 (CR2, decided by Alexis): a touch keyboard has no Shift, so there Enter adds the line and Send sends.
  it("adds a line on Enter, and submits nothing, when asked that Enter adds a line", async () => {
    const { submitted, box } = formOf({ enterAddsLine: true });
    await userEvent.type(box, "one{Enter}two{Shift>}{Enter}{/Shift}three");
    expect(box).toHaveProperty("value", "one\ntwo\nthree");
    expect(submitted).not.toHaveBeenCalled();
  });

  it("shows its prefix before the box, outside its value", () => {
    render(<Field label="Name" prefix="@" value="alexis" onChange={vi.fn()} />);
    expect(screen.getByText("@")).toBeTruthy();
    expect(screen.getByRole<HTMLInputElement>("textbox", { name: "Name" }).value).toBe("alexis");
  });

  it("hands each keystroke's value to its handler", async () => {
    const onChange = vi.fn();
    render(<Field label="Name" value="" onChange={onChange} />);
    await userEvent.type(screen.getByRole("textbox"), "a");
    expect(onChange).toHaveBeenCalledWith("a");
  });

  it("gives each field ids of its own, each box named by its own label and described by its own help", () => {
    render(
      <>
        <Field label="Name" help="first" value="" onChange={vi.fn()} />
        <Field label="Name" help="second" value="" onChange={vi.fn()} />
      </>,
    );
    const said = screen
      .getAllByRole("textbox", { name: "Name" })
      .map((box) => document.getElementById(box.getAttribute("aria-describedby") ?? "")?.textContent);
    expect(said).toEqual(["first", "second"]);
  });

  it("shows a label, help, error and prefix made of markup, or very long, as text", () => {
    staysText((text) => <Field label={text} help={text} error={text} value="" onChange={vi.fn()} />);
    staysText((text) => <Field label="Name" prefix={text} value="" onChange={vi.fn()} />);
  });

  it("has stories for text, search, date, a prefix, help and an error", () => {
    const shown = eachStory(stories, (container) => ({
      type: container.querySelector("input")?.getAttribute("type"),
      invalid: container.querySelector("[aria-invalid='true']") !== null,
    }));
    for (const type of ["text", "search", "datetime-local"]) expect(shown.some((s) => s.type === type)).toBe(true);
    expect(shown.some((s) => s.invalid)).toBe(true);
  });
});
