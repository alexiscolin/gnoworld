// A visit's mark, all of it from the world's seed: continuous values, so no two worlds draw one mark in another ink.
function unit(seed: string, key: string): number {
  let hash = 2166136261;
  for (const char of `${seed}#${key}`) hash = Math.imul(hash ^ (char.codePointAt(0) ?? 0), 16777619);
  return (hash >>> 0) / 4294967296;
}

export interface StampLook {
  /** The superellipse's exponent: 2 an ellipse, more a squarer outline. */
  roundness: number;
  rx: number;
  ry: number;
  /** Degrees. */
  tilt: number;
  hue: number;
  dash: string;
}

export function stampLook(seed: string): StampLook {
  const aspect = 0.86 + unit(seed, "a") * 0.28;
  return {
    roundness: 2 + unit(seed, "n") * 2.6,
    rx: 44 * Math.min(1, aspect),
    ry: 44 * Math.min(1, 1 / aspect),
    tilt: (unit(seed, "r") - 0.5) * 14,
    hue: Math.round(unit(seed, "hue") * 360),
    dash: `${(0.8 + unit(seed, "dl") * 3).toFixed(1)} ${(1.6 + unit(seed, "dg") * 2.4).toFixed(1)}`,
  };
}

const STEPS = 72;

/** The outline as a closed path, `scale` times the stamp's own. */
export function outline({ roundness, rx, ry }: StampLook, scale: number): string {
  const points = Array.from({ length: STEPS }, (_, at) => {
    const angle = (at / STEPS) * Math.PI * 2;
    const [cos, sin] = [Math.cos(angle), Math.sin(angle)];
    const x = Math.sign(cos) * Math.abs(cos) ** (2 / roundness) * rx * scale;
    const y = Math.sign(sin) * Math.abs(sin) ** (2 / roundness) * ry * scale;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });
  return `M${points.join("L")}Z`;
}
