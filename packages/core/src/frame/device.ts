// What a device gets of the scene (ADR-0002 §8, row 10, and §9): by its GPU's name, its screen and the reader's data saver.

export type Tier = "high" | "low";
export type SceneOffer = "auto" | "ask" | "none";

/** Whether a GPU's name says it cannot carry the scene: a software renderer, an old mobile or integrated chip. A masked name says no. */
export function isWeakGpu(name: string): boolean {
  return [
    /swiftshader|llvmpipe|softpipe|software|basic render/i,
    /\bmali-(?:[34]\d\d|t[67]\d\d)\b/i,
    /\badreno \(tm\) [34]\d\d\b/i,
    /\bpowervr sgx\b/i,
    /\bintel.*\b(?:gma|hd graphics(?! \d{3}\b))/i,
  ].some((pattern) => pattern.test(name));
}

/** The pixel ratio to draw at: the screen's, capped by the tier and by a touch screen. */
export function pixelRatioFor(ratio: number, touch: boolean, tier: Tier): number {
  const cap = tier === "high" ? (touch ? 1 : 1.25) : touch ? 0.8 : 1;
  return Math.min(ratio, cap);
}

/** Whether the 3D loads by itself, waits to be asked, or is not offered. */
export function sceneOffer(device: {
  readonly weak: boolean;
  readonly phone: boolean;
  readonly savesData: boolean;
}): SceneOffer {
  if (device.weak) return "none";
  return device.phone || device.savesData ? "ask" : "auto";
}
