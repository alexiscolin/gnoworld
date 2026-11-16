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
  const cap = tier === "high" ? (touch ? 1 : 2) : touch ? 0.8 : 1;
  return Math.min(ratio, cap);
}

/** Whether the 3D loads by itself, waits to be asked, or is not offered. */
export function sceneOffer(device: {
  readonly weak: boolean;
  readonly phone: boolean;
  readonly savesData: boolean;
}): SceneOffer {
  // A phone is the full chat alone until its 3D pass (D13711).
  if (device.weak || device.phone) return "none";
  return device.savesData ? "ask" : "auto";
}
