import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Disclosure } from "./Disclosure.tsx";

describe("Disclosure", () => {
  it("tells onToggle the state the person's click gives it, open then shut", async () => {
    const onToggle = vi.fn();
    render(
      <Disclosure title="Row" onToggle={onToggle}>
        body
      </Disclosure>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Row" }));
    await userEvent.click(screen.getByRole("button", { name: "Row" }));
    expect(onToggle.mock.calls).toEqual([[true], [false]]);
  });

  it("does not tell onToggle when the row is opened from outside", () => {
    const onToggle = vi.fn();
    const { rerender } = render(
      <Disclosure title="Row" open={false} onToggle={onToggle}>
        body
      </Disclosure>,
    );
    rerender(
      <Disclosure title="Row" open onToggle={onToggle}>
        body
      </Disclosure>,
    );
    expect(screen.getByRole("button", { name: "Row" }).getAttribute("aria-expanded")).toBe("true");
    expect(onToggle).not.toHaveBeenCalled();
  });
});
