// @vitest-environment jsdom
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { useCompact } from "./useCompact.ts";

function Probe() {
  const [box, setBox] = useState<HTMLDivElement | null>(null);
  const compact = useCompact(box, 900);
  return (
    <div ref={setBox} data-compact={compact ? "yes" : "no"}>
      box
    </div>
  );
}

describe("useCompact", () => {
  it("counts a box not measured yet as compact, so no panel is drawn before its width is known", () => {
    // jsdom lays nothing out: the width stays 0, never read.
    const { container } = render(<Probe />);
    expect(container.querySelector("[data-compact]")?.getAttribute("data-compact")).toBe("yes");
  });
});
