// The particles study's values (particles.ts), the panel's "Study" section: what a slider moves, its span, and whether a move stands the
// mass again or only draws it. Nothing of the product reads them: the ones Alexis keeps land in code as a part of their own, test first.
import type { Studied } from "./controls.ts";

const WHERE = "app/lab/particles*.ts (the study)";

export const values = {
  size: 1.5,
  pack: 1.25,
  gap: 1,
  passes: 6,
  earthRoom: 6,
  world: 0.3,
  realm: 0.16,
  package: 0.14,
  grain: 0.07,
  dust: 4,
  clump: 0.32,
  realmNear: 0.22,
  least: 0.8,
  light: 1,
  dustLight: 0.55,
  far: 0.35,
  warm: 0.85,
  goldLift: 1.5,
  dim: 0.85,
  lineLight: 1.6,
  ringLight: 0.3,
  distance: 0,
  pitch: 0.3,
  yaw: 0.55,
  aim: 0.35,
};
export type Name = keyof typeof values;

const SPANS: Record<Name, readonly [label: string, min: number, max: number, step: number]> = {
  size: ["Clump: size (times the cube root of its particles)", 0.3, 5, 0.05],
  pack: ["Mass: packing, 1 is touching", 0.6, 2.5, 0.01],
  gap: ["Clumps: least gap, of their radii", 0, 1.5, 0.01],
  passes: ["Clumps: pushing passes", 0, 20, 1],
  earthRoom: ["Earth: room at the middle", 0, 30, 0.5],
  world: ["Particle: a world's size", 0.05, 2, 0.01],
  realm: ["Particle: a realm's size", 0.05, 2, 0.01],
  package: ["Particle: a package's size", 0.05, 2, 0.01],
  grain: ["Dust: a grain's size", 0.01, 1, 0.01],
  dust: ["Dust: grains for each real particle", 0, 12, 0.1],
  realmNear: ["Realms: how near their world", 0, 1, 0.01],
  clump: ["Clump: spread, of its radius", 0.05, 1, 0.01],
  least: ["Particle: least px", 0.3, 3, 0.05],
  light: ["Particle: light", 0.1, 4, 0.05],
  dustLight: ["Dust: light", 0, 2, 0.01],
  far: ["Depth: light left afar", 0, 1, 0.01],
  warm: ["Colour: peach and rose share", 0, 1, 0.01],
  goldLift: ["Chosen: gold lift", 1, 6, 0.05],
  dim: ["Others: light", 0.1, 1.5, 0.01],
  lineLight: ["Line of light", 0, 3, 0.05],
  ringLight: ["Rings", 0, 1, 0.01],
  distance: ["Eye: distance (0, the whole mass in view)", 0, 1600, 1],
  pitch: ["Eye: pitch", -1.4, 1.4, 0.01],
  yaw: ["Eye: yaw", -3.15, 3.15, 0.01],
  aim: ["Eye: aims at the chosen", 0, 1, 0.01],
};

// A move of one of these stands the mass again; the others only draw it.
const LAYOUT = new Set<Name>([
  "size",
  "pack",
  "gap",
  "passes",
  "earthRoom",
  "world",
  "realm",
  "package",
  "grain",
  "dust",
  "realmNear",
  "clump",
]);

/** Sets `name`, and says whether the mass must stand again. */
export function setValue(name: Name, value: number): boolean {
  values[name] = value;
  return LAYOUT.has(name);
}

/** The panel's rows, each telling `stand` when the mass must stand again. */
export function studied(stand: () => void): Studied[] {
  return (Object.keys(values) as Name[]).map((name) => {
    const [label, min, max, step] = SPANS[name];
    return {
      name: `study.${name}`,
      label,
      min,
      max,
      step,
      value: values[name],
      where: WHERE,
      set: (value: number) => {
        if (setValue(name, value)) stand();
      },
    };
  });
}
