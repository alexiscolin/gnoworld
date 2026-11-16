// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { mount } from "../../../tests/mount.tsx";
import { SpaceFoot } from "./SpaceFoot.tsx";

const pressed = vi.hoisted(() => vi.fn());
const saves = vi.hoisted(() => ({ on: false }));
vi.mock("./space.ts", () => ({ offer: { state: "ask", heard: { subscribe: () => () => undefined } }, press: pressed }));
vi.mock("./gpu.ts", () => ({ gpuCanDraw: () => true }));
vi.mock("../../lib/saveData.ts", () => ({ savesData: () => saves.on }));

// A window at `wide` or not, which a test may widen: its listeners hear the change.
function windowOf(phone: boolean) {
  const heard = new Set<() => void>();
  const query = {
    matches: phone,
    addEventListener: (_: string, f: () => void) => heard.add(f),
    removeEventListener: (_: string, f: () => void) => heard.delete(f),
  };
  vi.stubGlobal("matchMedia", () => query);
  return () => {
    query.matches = false;
    for (const f of heard) f();
  };
}

afterEach(() => {
  pressed.mockClear();
  saves.on = false;
});

describe("SpaceFoot, a session that started on a phone", () => {
  it("takes space once its window grows past the phone's width, the offer asked for the width alone", () => {
    const widen = windowOf(true);
    mount(<SpaceFoot />);
    expect(pressed).not.toHaveBeenCalled();
    widen();
    expect(pressed).toHaveBeenCalledTimes(1);
  });

  it("waits to be asked on a computer that saves data", () => {
    saves.on = true;
    windowOf(false);
    mount(<SpaceFoot />);
    expect(pressed).not.toHaveBeenCalled();
  });

  it("never takes space while the window is a phone's", () => {
    windowOf(true);
    mount(<SpaceFoot />);
    expect(pressed).not.toHaveBeenCalled();
  });
});
