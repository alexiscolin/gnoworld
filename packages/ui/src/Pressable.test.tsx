import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Pressable } from "./Pressable.tsx";

describe("Pressable", () => {
  it("is a link when it has an href, with its class and aria-current", () => {
    render(
      <Pressable href="/a" className="x" aria-current="true">
        Go
      </Pressable>,
    );
    const link = screen.getByRole("link", { name: "Go" });
    expect([link.getAttribute("href"), link.className, link.getAttribute("aria-current")]).toEqual(["/a", "x", "true"]);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("is a type=button button when it has an onClick, which it calls", async () => {
    const onClick = vi.fn();
    render(
      <Pressable onClick={onClick} className="x">
        Do
      </Pressable>,
    );
    const button = screen.getByRole("button", { name: "Do" });
    expect([button.getAttribute("type"), button.className]).toEqual(["button", "x"]);
    await userEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("is plain text, neither a link nor a button, when it has neither", () => {
    const { container } = render(<Pressable className="x">Just words</Pressable>);
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
    expect(container.textContent).toBe("Just words");
  });
});
