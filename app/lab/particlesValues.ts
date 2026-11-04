// The particles study's values (particles.ts), the panel's "Study" section: what a slider moves, its span, and whether a move stands the
// cloud again or only draws it. Nothing of the product reads them: the ones Alexis keeps land in code as a part of their own, test first.
import type { Studied } from "./controls.ts";

const WHERE = "app/lab/particles*.ts (the study)";

export const values = {
  aperture: 12,
  blurMost: 34,
  glow: 1.9,
  least: 0.9,
  bokeh: 1.1,
  light: 0.5,
  particle: 0.9,
  calm: 10,
  warm: 0.8,
  clusterLeast: 4,
  join: 30,
  gather: 0.3,
  spread: 1.6,
  size: 2.6,
  flat: 0.6,
  goldLift: 1.6,
  dim: 0.75,
  lineLight: 1.8,
  ringLight: 0.3,
  distance: 140,
  pitch: 0.36,
  yaw: 0.55,
  aim: 0.8,
  focusShare: 1,
  popular: 1,
};
export type Name = keyof typeof values;

const SPANS: Record<Name, readonly [label: string, min: number, max: number, step: number]> = {
  aperture: ["Depth of field: aperture", 0, 200, 0.5],
  blurMost: ["Depth of field: widest blur, px", 0, 200, 1],
  glow: ["Particle: glow", 0.2, 6, 0.05],
  least: ["Particle: least px", 0.3, 3, 0.05],
  bokeh: ["Blur keeps light (2 = physical)", 0, 2, 0.05],
  light: ["Particle: light", 0.1, 5, 0.05],
  particle: ["Particle: size", 0.1, 2, 0.01],
  calm: ["Crowd: worlds at full light", 1, 64, 1],
  warm: ["Colour: peach and rose share", 0, 1, 0.01],
  clusterLeast: ["Cluster: fewest worlds", 1, 32, 1],
  join: ["Cluster: joins within", 0, 120, 1],
  gather: ["Cluster: gathers in", 0, 1, 0.01],
  spread: ["Clusters: spread", 0.3, 4, 0.05],
  size: ["Cluster: size", 0.5, 12, 0.05],
  flat: ["Cluster: flatness", 0.1, 1, 0.01],
  goldLift: ["Chosen: gold lift", 1, 6, 0.05],
  dim: ["Others: light", 0.1, 1.5, 0.01],
  lineLight: ["Line of light", 0, 3, 0.05],
  ringLight: ["Rings", 0, 1, 0.01],
  distance: ["Eye: distance", 30, 1600, 1],
  pitch: ["Eye: pitch", -1.4, 1.4, 0.01],
  yaw: ["Eye: yaw", -3.15, 3.15, 0.01],
  aim: ["Eye: aims at the chosen", 0, 1, 0.01],
  focusShare: ["Focus: share of the chosen's distance", 0.2, 3, 0.01],
  popular: ["Popular clusters near the Earth (0/1)", 0, 1, 1],
};

// A move of one of these stands the cloud again; the others only draw it.
const LAYOUT = new Set<Name>([
  "clusterLeast",
  "join",
  "gather",
  "spread",
  "size",
  "flat",
  "popular",
  "particle",
  "calm",
]);

/** Sets `name`, and says whether the cloud must stand again. */
export function setValue(name: Name, value: number): boolean {
  values[name] = value;
  return LAYOUT.has(name);
}

/** The panel's rows, each telling `moved` when the cloud must stand again. */
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
