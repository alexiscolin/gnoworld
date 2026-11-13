// @vitest-environment jsdom
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mountInStore } from "../../../tests/inStore.tsx";
import { motionOf } from "../../space/motion.ts";
import { useSettingsApplied } from "./applied.ts";

// Each setting takes effect with no reload (slice 8, row 8): the page marks it on the root as it changes, where the stylesheets read the
// motion, space the quality and the motion (space/frame.ts, space/motion.ts), and its foot the 3D on a phone (SpaceFoot.tsx).
const root = () => document.documentElement.dataset;
const flushed = () =>
  act(async () => {
    await Promise.resolve();
  });

let system = false;
beforeEach(() => {
  localStorage.clear();
  for (const key of ["motion", "quality", "phone3d"]) Reflect.deleteProperty(root(), key);
  system = false;
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      get matches() {
        return system;
      },
      addEventListener: () => undefined,
    })),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
});

function Applied() {
  useSettingsApplied();
  return null;
}
async function settingsPage() {
  const { store } = await mountInStore(<Applied />);
  const set = (change: Record<string, unknown>) => {
    act(() => {
      store.getState().deviceActions.change("settings", (held) => ({ ...held, ...change }));
    });
  };
  return { set };
}

describe("the settings on the page's root", () => {
  it("mark nothing at their defaults", async () => {
    await settingsPage();
    expect(root()["motion"]).toBeUndefined();
    expect(root()["quality"]).toBeUndefined();
    expect(root()["phone3d"]).toBeUndefined();
  });

  it("mark each setting as it changes, and take it off again, with no reload", async () => {
    const { set } = await settingsPage();
    set({ calm: true });
    expect(root()["motion"]).toBe("reduce");
    set({ quality: "low" });
    expect(root()["quality"]).toBe("low");
    set({ quality: "high" });
    expect(root()["quality"]).toBe("high");
    set({ phone3d: true });
    expect(root()["phone3d"]).toBe("on");
    set({ calm: false, quality: "auto", phone3d: false });
    expect(root()["motion"]).toBeUndefined();
    expect(root()["quality"]).toBeUndefined();
    expect(root()["phone3d"]).toBeUndefined();
  });

  it("mark the settings the device kept at the page's start (a reload keeps them)", async () => {
    localStorage.setItem("gnoworld:device:settings", JSON.stringify({ quality: "low", calm: true, phone3d: true }));
    await settingsPage();
    await flushed();
    expect(root()["motion"]).toBe("reduce");
    expect(root()["quality"]).toBe("low");
    expect(root()["phone3d"]).toBe("on");
  });

  it("keep a change on the device, for the next page", async () => {
    const { set } = await settingsPage();
    set({ quality: "high" });
    expect(JSON.parse(localStorage.getItem("gnoworld:device:settings") ?? "{}")).toEqual({
      quality: "high",
      calm: false,
      phone3d: false,
      language: "en",
      autoTranslate: true,
    });
  });
});

describe("space's reading of the settings", () => {
  it("reduces motion at the system's word or the setting's, and hears the setting change", async () => {
    const motion = motionOf();
    expect(motion.matches).toBe(false);
    system = true;
    expect(motion.matches).toBe(true);
    system = false;
    const changed = vi.fn();
    const leaving = new AbortController();
    motion.watch(changed, leaving.signal);
    root()["motion"] = "reduce";
    await flushed();
    expect(motion.matches).toBe(true);
    expect(changed).toHaveBeenCalledTimes(1);
    leaving.abort();
    Reflect.deleteProperty(root(), "motion");
    await flushed();
    expect(changed).toHaveBeenCalledTimes(1);
  });
});
