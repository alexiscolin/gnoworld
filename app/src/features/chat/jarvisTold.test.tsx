// @vitest-environment jsdom
import type { JarvisState } from "@gnoworld/schemas";
import { act } from "react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { Result as HttpResult } from "../../lib/api/http.ts";
import { mount, settled } from "../../../tests/mount.tsx";
import { jarvisRoom, useJarvisOn } from "./jarvisTold.tsx";

// 10u-a: whether Jarvis is on, for the page, and the room it reads.
type Result = HttpResult<JarvisState>;

beforeAll(() => {
  vi.stubGlobal("reportError", vi.fn());
});

function Probe({ read }: { read: () => Promise<Result> }) {
  return <p>{useJarvisOn(read) ? "on" : "off"}</p>;
}

describe("whether Jarvis is on, for the page", () => {
  it("is off until the server says on, and asks once", async () => {
    const read = vi.fn(() => Promise.resolve<Result>({ ok: true, value: { on: true } }));
    const box = mount(<Probe read={read} />);
    expect(box.textContent).toBe("off");
    await settled(() => box.textContent === "on");
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("asks once for two parts that ask together, and once more for none on a room's change", async () => {
    const read = vi.fn(() => Promise.resolve<Result>({ ok: true, value: { on: true } }));
    const [a, b] = [mount(<Probe read={read} />), mount(<Probe read={read} />)];
    await settled(() => a.textContent === "on" && b.textContent === "on");
    mount(<Probe read={read} />);
    await act(() => Promise.resolve());
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("reads again after a failure, never keeping it as the answer for the page's life", async () => {
    const read = vi
      .fn<() => Promise<Result>>()
      .mockResolvedValueOnce({ ok: false, reason: "unavailable" })
      .mockResolvedValue({ ok: true, value: { on: true } });
    const first = mount(<Probe read={read} />);
    await settled(() => read.mock.calls.length === 1);
    await act(() => Promise.resolve());
    expect(first.textContent).toBe("off");
    const second = mount(<Probe read={read} />);
    await settled(() => second.textContent === "on");
    expect(read).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["off", { ok: true, value: { on: false } }],
    ["an error", { ok: false, reason: "unavailable" }],
    ["a body off the schema", { ok: false, reason: "malformed" }],
  ] as [string, Result][])("stays off for %s, and asked once", async (_, answer) => {
    const read = vi.fn(() => Promise.resolve(answer));
    const box = mount(<Probe read={read} />);
    await settled(() => read.mock.calls.length === 1);
    await read.mock.results[0]?.value;
    await act(() => Promise.resolve());
    expect(box.textContent).toBe("off");
    expect(read).toHaveBeenCalledTimes(1);
  });
});

describe("the room Jarvis reads", () => {
  it("is the room in view", () => {
    expect(jarvisRoom({ kind: "room", room: "#bubble" })).toBe("#bubble");
    expect(jarvisRoom({ kind: "room", room: "#bubble/games" })).toBe("#bubble/games");
  });

  it("is none in a direct message, on a page with no room, and for a room that is no room", () => {
    expect(jarvisRoom({ kind: "dm", room: undefined })).toBeUndefined();
    expect(jarvisRoom({ kind: "dm", room: "#bubble" })).toBeUndefined();
    expect(jarvisRoom({ kind: "room", room: undefined })).toBeUndefined();
    expect(jarvisRoom(undefined)).toBeUndefined();
    expect(jarvisRoom({ kind: "room", room: "bubble" })).toBeUndefined();
  });
});
