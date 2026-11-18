// @vitest-environment jsdom
// What a room's view gives its list (lineList.ts's props) and puts in its place, drawn in a page: RoomView.test.tsx draws markup alone.
import type { Line } from "@gnoworld/core";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount, noMedia } from "../../../../tests/mount.tsx";
import type { LinesProps } from "./lineList.ts";
import { RoomView, type RoomViewProps } from "./RoomView.tsx";

// The lines view, without its code: what the room tells it of a jump.
vi.mock("./Lines.tsx", () => ({ Lines: ({ jumped }: LinesProps) => <ol data-jumped={String(jumped)} /> }));

const LINE: Line = {
  id: "a",
  time: "2026-10-25T10:00:00.000Z",
  from: "g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv",
  account: "g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv",
  text: "hello",
  kind: "message",
};
const view = (state: RoomViewProps["state"]) => (
  <RoomView room="#bubble/games" state={state} chat="connected" onDelete={() => false} onDismiss={() => undefined} />
);
// The lines view is lazy: drawn once its chunk's promise settles.
const drawn = async (state: RoomViewProps["state"]) => {
  const box = mount(view(state));
  await act(async () => {
    await Promise.resolve();
  });
  return box;
};

describe("a room that arrives", () => {
  beforeEach(() => {
    noMedia();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  // A history that never comes (Ergo refused the room, or answers nothing) must not leave a skeleton for good.
  it("says the empty room's words after 10 s without its history, the skeleton gone", () => {
    const box = mount(view({ lines: [], members: [] }));
    expect(box.querySelector('[aria-busy="true"] [data-shape]')).not.toBeNull();
    act(() => {
      vi.advanceTimersByTime(9_999);
    });
    expect(box.textContent).not.toContain("No messages yet.");
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(box.textContent).toContain("No messages yet.");
    expect(box.querySelector("[data-shape]")).toBeNull();
  });

  it("tells its lines a room read around a found message, and no other", async () => {
    const around = await drawn({ lines: [LINE], members: [], paged: true, jump: "a" });
    expect(around.querySelector("ol")?.getAttribute("data-jumped")).toBe("true");
    const latest = await drawn({ lines: [LINE], members: [], paged: true });
    expect(latest.querySelector("ol")?.getAttribute("data-jumped")).toBe("false");
  });
});
