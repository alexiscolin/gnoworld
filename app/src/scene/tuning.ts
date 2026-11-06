/// <reference types="vite/client" />
// The workshop's registry (docs/DEVELOPMENT.md, "The workshop"): the scene's values the lab's tuning panel sets live, each read where it is
// used. Every read is written on the lab's switch, `import.meta.env.GNOWORLD_TUNING === "1"`, which lab.config.ts alone defines: a site's
// build replaces it with nothing, so the read folds back to the code's own value and this module goes with it (tuning.spec.ts).

declare global {
  interface ImportMetaEnv {
    readonly GNOWORLD_TUNING?: string;
  }
}

/** The values the panel may set, by a name it lists them under and a build is searched for. */
export const TUNABLES = ["grade.exposure", "eye.lean", "eye.arrivalShare"] as const;
export type Tunable = (typeof TUNABLES)[number];

// Its names stay in any build that keeps it, as the build test looks for them.
interface Held {
  /** Each value as the code has it, from its first read: the panel's default. */
  readonly workshopDefaults: Map<Tunable, number>;
  readonly workshopValues: Map<Tunable, number>;
  readonly workshopFollowers: Map<Tunable, () => void>;
}
let held: Held | undefined;
const registry = (): Held =>
  (held ??= { workshopDefaults: new Map(), workshopValues: new Map(), workshopFollowers: new Map() });

/** `name`'s value: the panel's, or else `value`, the code's own, kept as its default from the first read. */
export function tuned(name: Tunable, value: number): number {
  const { workshopDefaults, workshopValues } = registry();
  if (!workshopDefaults.has(name)) workshopDefaults.set(name, value);
  return workshopValues.get(name) ?? value;
}

/** Gives `apply` `name`'s value now and at each change. A name has one follower, the latest: a renderer made again lets the old one go. */
export function applyTuned(name: Tunable, value: number, apply: (value: number) => void): void {
  const follow = () => {
    apply(tuned(name, value));
  };
  registry().workshopFollowers.set(name, follow);
  follow();
}

/** The panel's value for `name`, or none, which puts back the code's. */
export function setTuned(name: Tunable, value: number | undefined): void {
  const { workshopValues, workshopFollowers } = registry();
  if (value === undefined) workshopValues.delete(name);
  else workshopValues.set(name, value);
  workshopFollowers.get(name)?.();
}

/** The values the code has read so far, each at the code's own. */
export function tunedDefaults(): ReadonlyMap<Tunable, number> {
  return registry().workshopDefaults;
}
