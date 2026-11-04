// The whole cosmos's palettes to choose from (7u; Alexis, 2026-11-04 night, "quitte à mettre un fond blanc, en mode on a unveil
// l'univers"), for the lab's cosmos alone: `palette=1` to `5` paints the mass the scene stands (web.ts). Each preset's colours are this
// table, a design system's token by its name or the preset's own colour; the first is the product's default, the design system's.
import { Color } from "three";
import { paletteOf, type WebPalette } from "../src/scene/cosmos/webHeld.ts";

// world, realm, package, dust, Earth, a new world: core's MASS_KIND order.
interface Preset {
  readonly ground: string;
  readonly kinds: readonly [string, string, string, string, string, string];
  readonly tone: string;
  readonly shadow: number;
  readonly farLight: number;
  /** Each kind's light, in the same order. */
  readonly light: readonly [number, number, number, number, number, number];
}

const PRESETS: Readonly<Record<string, Preset>> = {
  // Dispersion's: a dark ground, small sharp points, pale gold, amber and orange by kind (its gradient comes back if Alexis picks it).
  "2": {
    ground: "#050403",
    kinds: ["#f2e3a6", "#e0b05a", "#d9a441", "#b8642a", "--world", "--color-new"],
    tone: "--color-warm",
    shadow: 0.25,
    farLight: 0.3,
    light: [1, 0.75, 0.7, 0.4, 1, 0.9],
  },
  // Unveiled: the design system's cream as the ground, matte white and pale grey spheres, our colours as accents.
  "3": {
    ground: "--color-primary",
    kinds: ["#ffffff", "#e3e0db", "#d6dade", "#cfcac3", "--world", "--color-new"],
    tone: "--color-warm",
    shadow: 0.38,
    farLight: 0.97,
    light: [1.25, 1.15, 1.15, 1.05, 1, 1],
  },
  // The blue dust: a deep blue ground, white and pale blue glitter.
  "4": {
    ground: "#0b1a5e",
    kinds: ["#ffffff", "#c4d2ff", "#9db3ff", "#7d97ff", "--color-primary", "--color-new"],
    tone: "#ffffff",
    shadow: 0.45,
    farLight: 0.4,
    light: [1, 0.85, 0.8, 0.6, 1, 0.9],
  },
  // Lavender on cream: matte lavender and white spheres on a warm light ground.
  "5": {
    ground: "#e8e3dc",
    kinds: ["#ffffff", "#9d86ea", "#b9a8f0", "#c9bdf0", "--world", "--color-new"],
    tone: "--color-signal",
    shadow: 0.38,
    farLight: 0.97,
    light: [1.25, 1.1, 1.1, 1.05, 1, 1],
  },
};

const colourOf = (style: CSSStyleDeclaration, value: string) =>
  new Color().setStyle(value.startsWith("--") ? style.getPropertyValue(value).trim() : value);

/** The palette `name` names, or the design system's for any other. */
export function paletteNamed(name: string | null, page: Element): WebPalette {
  const preset = name === null ? undefined : PRESETS[name];
  if (preset === undefined) return paletteOf(page);
  const style = getComputedStyle(page);
  const kinds = preset.kinds.map((value, kind) => colourOf(style, value).multiplyScalar(preset.light[kind] ?? 1));
  return {
    ground: colourOf(style, preset.ground),
    kinds,
    tone: colourOf(style, preset.tone),
    shadow: preset.shadow,
    farLight: preset.farLight,
  };
}
