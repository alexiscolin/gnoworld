import type { Line } from "@gnoworld/core";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { useRemoval } from "./lineFlash.ts";

const line = (id: string): Line => ({ id, time: "2026-10-25T10:00:01.000Z", from: "a", text: id, kind: "message" });
const LINES = [line("m1"), line("m2")];

// A button that deletes m1 and says which line waits for its answer, the chat connected or not, a line refused or not.
function Waiting({ connected, refused }: { connected: boolean; refused?: string }) {
  const [deleting, remove] = useRemoval({
    lines: LINES,
    refused,
    connected,
    onDelete: () => true,
    leave: () => undefined,
    setSaid: () => undefined,
  });
  return (
    <button
      type="button"
      onClick={() => {
        remove("m1");
      }}
    >
      {deleting ?? "none"}
    </button>
  );
}

const host = document.createElement("div");
const root = createRoot(host);
const show = (connected: boolean, refused?: string) => {
  act(() => {
    root.render(<Waiting connected={connected} {...(refused === undefined ? {} : { refused })} />);
  });
  return host.textContent;
};
const press = () => {
  act(() => {
    host.querySelector("button")?.click();
  });
  return host.textContent;
};

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
afterEach(() => {
  show(false);
});

describe("useRemoval", () => {
  it("offers no second delete while one waits for Ergo, and again when its refusal comes", () => {
    show(true);
    expect(press()).toBe("m1");
    expect(show(true, "m1")).toBe("none");
  });

  // /code-review on 4d's DM bar (CR1): a link that dropped forgot the waiting delete, whose refusal then never came, so the
  // line offered no Delete again until the conversation was mounted anew.
  it("offers the line's delete again once the link drops, its answer being lost with it", () => {
    show(true);
    expect(press()).toBe("m1");
    expect(show(false)).toBe("none");
  });
});
