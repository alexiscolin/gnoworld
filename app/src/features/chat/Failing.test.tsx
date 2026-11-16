// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { Failing } from "./Failing.tsx";

function Breaks(): never {
  throw new TypeError("Failed to fetch dynamically imported module: /a.js");
}

describe("Failing", () => {
  it("gives its fallback the failure it caught, so the words can say a chunk was left across a deploy", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const host = document.createElement("div");
    act(() => {
      createRoot(host).render(
        <Failing
          fallback={(error) => <p>{error instanceof TypeError ? error.message : "other"}</p>}
          renew={() => undefined}
        >
          <Breaks />
        </Failing>,
      );
    });
    expect(host.textContent).toContain("dynamically imported module");
  });
});
