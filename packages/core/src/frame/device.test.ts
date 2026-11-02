import { describe, expect, it } from "vitest";
import { isWeakGpu, pixelRatioFor, sceneOffer } from "./device.ts";

describe("isWeakGpu", () => {
  it.each([
    // What Playwright's Chromium answers on this machine, read on 2026-11-01.
    "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (LLVM 10.0.0) (0x0000C0DE)), SwiftShader driver)",
    "Google SwiftShader",
    "llvmpipe (LLVM 15.0.7, 256 bits)",
    "softpipe",
    "Apple Software Renderer",
    "Microsoft Basic Render Driver",
    "ANGLE (Microsoft, Microsoft Basic Render Driver (0x0000008C) Direct3D11 vs_5_0 ps_5_0, D3D11)",
    "Mali-400 MP",
    "Mali-T720",
    "Adreno (TM) 306",
    "Adreno (TM) 420",
    "PowerVR SGX 544MP",
    "Intel(R) HD Graphics",
    "Intel(R) HD Graphics 3000",
    "ANGLE (Intel, Intel(R) HD Graphics 4000 Direct3D11 vs_5_0 ps_5_0, D3D11)",
    "Intel GMA 950",
    "swiftshader",
    "LLVMPIPE",
  ])("refuses %s", (name) => {
    expect(isWeakGpu(name)).toBe(true);
  });

  it.each([
    "ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Max, Unspecified Version)",
    "Apple GPU",
    "Adreno (TM) 650",
    "Adreno (TM) 610",
    "Adreno (TM) 619",
    "ANGLE (Qualcomm, Adreno (TM) 618, OpenGL ES 3.2)",
    "Mali-G52",
    "Mali-G57",
    "Mali-G68",
    "Mali-G78",
    "NVIDIA GeForce RTX 3060",
    "AMD Radeon Pro 5500M",
    "Intel(R) UHD Graphics 630",
    "Intel(R) HD Graphics 620",
    "Intel(R) Iris(R) Xe Graphics",
  ])("lets %s through", (name) => {
    expect(isWeakGpu(name)).toBe(false);
  });

  it("lets a masked name through: the Auto probe judges it by its frames", () => {
    expect(isWeakGpu("")).toBe(false);
    expect(isWeakGpu("WebKit WebGL")).toBe(false);
  });
});

describe("pixelRatioFor", () => {
  it.each([
    { ratio: 2, touch: false, tier: "high", want: 2 },
    { ratio: 3, touch: false, tier: "high", want: 2 },
    { ratio: 1, touch: false, tier: "high", want: 1 },
    { ratio: 3, touch: true, tier: "high", want: 1 },
    { ratio: 2, touch: false, tier: "low", want: 1 },
    { ratio: 3, touch: true, tier: "low", want: 0.8 },
    { ratio: 0.5, touch: true, tier: "low", want: 0.5 },
    { ratio: 0.75, touch: false, tier: "high", want: 0.75 },
  ] as const)("a screen at $ratio, touch $touch, tier $tier takes $want", ({ ratio, touch, tier, want }) => {
    expect(pixelRatioFor(ratio, touch, tier)).toBe(want);
  });
});

describe("sceneOffer", () => {
  it("loads by itself on a computer, after the text", () => {
    expect(sceneOffer({ weak: false, phone: false, savesData: false })).toBe("auto");
  });

  it("waits to be asked on a phone", () => {
    expect(sceneOffer({ weak: false, phone: true, savesData: false })).toBe("ask");
  });

  it("waits to be asked under the data saver, on a computer too", () => {
    expect(sceneOffer({ weak: false, phone: false, savesData: true })).toBe("ask");
  });

  it("offers nothing on a weak GPU, phone or not", () => {
    expect(sceneOffer({ weak: true, phone: false, savesData: false })).toBe("none");
    expect(sceneOffer({ weak: true, phone: true, savesData: false })).toBe("none");
    expect(sceneOffer({ weak: true, phone: false, savesData: true })).toBe("none");
  });
});
