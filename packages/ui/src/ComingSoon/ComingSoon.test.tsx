import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ComingSoon, Soon } from "./ComingSoon.tsx";

describe("ComingSoon", () => {
  it("is a focusable, aria-disabled button named '<name>, coming soon'", () => {
    render(<ComingSoon name="Jarvis" icon="spark" words="Jarvis" />);
    const button = screen.getByRole("button", { name: "Jarvis, coming soon" });
    expect(button.getAttribute("aria-disabled")).toBe("true");
  });

  it("Soon wears the class its caller gives, next to its own greyed one", () => {
    const { rerender } = render(<Soon name="Jarvis" words="Jarvis" />);
    const own = screen.getByRole("button").className;
    rerender(<Soon name="Jarvis" words="Jarvis" className="mine" />);
    const button = screen.getByRole("button");
    expect(button.classList.contains("mine")).toBe(true);
    for (const each of own.split(" ").filter(Boolean)) expect(button.classList.contains(each)).toBe(true);
  });

  it("Soon wears a caller's class on a plain face too", () => {
    render(
      <Soon name="Needs a wallet, soon" className="mine">
        Needs a wallet, soon
      </Soon>,
    );
    expect(screen.getByRole("button").classList.contains("mine")).toBe(true);
  });
});
