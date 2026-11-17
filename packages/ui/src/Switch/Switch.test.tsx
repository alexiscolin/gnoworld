import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Switch } from "./Switch.tsx";

describe("Switch", () => {
  it("is one switch named by its label alone, described by its line", () => {
    render(<Switch label="Sound" description="A chime" checked={false} onChange={vi.fn()} />);
    const input = screen.getByRole("switch", { name: "Sound" });
    expect(input.getAttribute("aria-labelledby")).not.toBeNull();
    expect(screen.getByRole("switch", { description: "A chime" })).toBe(input);
  });

  it("toggles once per press, on its name, its knob's box and the input", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Switch label="Sound" checked={false} onChange={onChange} />);
    const input = screen.getByRole("switch");
    await user.click(screen.getByText("Sound"));
    expect(onChange).toHaveBeenCalledTimes(1);
    await user.click(input.closest("label") ?? input);
    expect(onChange).toHaveBeenCalledTimes(2);
    await user.click(input);
    expect(onChange).toHaveBeenCalledTimes(3);
    expect(onChange).toHaveBeenLastCalledWith(true);
  });
});
