// The whole cosmos's matter and colours (web.ts; 7u): the file's worlds gathered by namespace as core's mass reads them, a world new for
// the week marked; how live each world is now; and the palette, the design system's own tokens read on the page (Alexis, 2026-11-04,
// "Palette du design system"), one colour a kind, low-key: mixed a third towards their grey, so none reads saturated.
import { auroraOf, MASS_KIND, type Mass, type MassNamespace } from "@gnoworld/core";
import { Color } from "three";
import { callsOf, heightAt, lastOf, type Universe } from "../live.ts";
import { usageOf, type CosmosWorld } from "./cosmosWorld.ts";

const WEEK_MS = 7 * 86_400_000;
const GREY = 1 / 3;
// Each kind's token and its light: worlds the brightest, their realms and packages under them, dust far under, the Earth its own.
const KINDS: readonly (readonly [kind: number, token: string, light: number])[] = [
  [MASS_KIND.world, "--color-primary", 0.7],
  [MASS_KIND.realm, "--color-warm", 0.6],
  [MASS_KIND.package, "--color-mine", 0.5],
  [MASS_KIND.dust, "--color-primary", 0.28],
  [MASS_KIND.earth, "--world", 1],
  [MASS_KIND.fresh, "--color-new", 0.75],
];

/** The file's worlds by namespace, each world new if the file first saw it within a week of its writing. */
export function namespacesOf(worlds: readonly CosmosWorld[], written: string | undefined): MassNamespace[] {
  const at = written === undefined ? Number.NaN : Date.parse(written);
  const held = new Map<string, Map<string, MassNamespace["worlds"][number]>>();
  for (const world of worlds) {
    const seen = world.seen === undefined || world.seen === null ? Number.NaN : Date.parse(world.seen);
    const one = held.get(world.namespace) ?? new Map<string, MassNamespace["worlds"][number]>();
    one.set(world.id, {
      id: world.id,
      realms: world.realms.map(({ path }, index) => path ?? `${world.id}#${String(index)}`),
      use: usageOf(world),
      fresh: at - seen < WEEK_MS,
    });
    held.set(world.namespace, one);
  }
  return [...held].map(([id, one]) => ({ id, worlds: [...one.values()], packages: [] }));
}

/** Where each particle of `laid` glides from: where `last` held its key, or where it stands for one new. */
export function glideFrom(laid: Mass, last: Mass | undefined): Float32Array {
  const from = new Float32Array(laid.positions);
  if (last === undefined) return from;
  const was = new Map(last.keys.map((key, at) => [key, at]));
  laid.keys.forEach((key, at) => {
    const before = was.get(key);
    if (before !== undefined) from.set(last.positions.subarray(before * 3, before * 3 + 3), at * 3);
  });
  return from;
}

/** How live each of the file's worlds is at `now`, by its id. */
function liveOf(worlds: readonly CosmosWorld[], universe: Universe, now: number): Map<string, number> {
  const height = heightAt(universe, now);
  return new Map(
    worlds.map((world) => [
      world.id,
      auroraOf({ calls: callsOf(world), lastHeight: lastOf(world) }, height, universe.calls),
    ]),
  );
}

/** The mass's look as one value: the ground, each kind's colour, the chosen clump's tone, the light on a sphere's far side, and how much of its light a far particle keeps before the ground. */
export interface WebPalette {
  readonly ground: Color;
  readonly kinds: readonly Color[];
  readonly tone: Color;
  readonly shadow: number;
  readonly farLight: number;
}

// With no page to read the tokens from: every kind a mid grey, on black.
const greyPalette = (): WebPalette => {
  const grey = () => new Color(0.5, 0.5, 0.5);
  const tone = grey();
  return {
    ground: new Color(),
    kinds: Array.from({ length: 6 }, grey),
    tone,
    shadow: 0.3,
    farLight: 0.35,
  };
};

const tokenOf = (style: CSSStyleDeclaration, token: string) => {
  const colour = new Color();
  const value = style.getPropertyValue(token).trim();
  if (value !== "") colour.setStyle(value);
  return colour;
};

/** The clump holding the most live worlds at `now`, or else the first, the most used; none with no clump. */
export function livelyOf(
  clumps: readonly { readonly id: string }[],
  worlds: readonly CosmosWorld[],
  { universe, now }: { readonly universe: Universe; readonly now: number },
): number {
  const live = liveOf(worlds, universe, now);
  const byClump = new Map<string, number>();
  for (const world of worlds)
    byClump.set(world.namespace, (byClump.get(world.namespace) ?? 0) + (live.get(world.id) ?? 0));
  let best = clumps.length > 0 ? 0 : -1;
  clumps.forEach(({ id }, at) => {
    if ((byClump.get(id) ?? 0) > (byClump.get(clumps[best]?.id ?? "") ?? 0)) best = at;
  });
  return best;
}

/** The design system's palette (Alexis, 2026-11-04), from the page's tokens, low-key: worlds cream, realms amber, packages mint, a new
 * world coral, dust a dim cream, the Earth `--world`; on the space's own ground, the chosen clump in amber. */
export function paletteOf(page: Element | undefined): WebPalette {
  if (page === undefined) return greyPalette();
  const style = getComputedStyle(page);
  const kinds = Array.from({ length: KINDS.length }, () => new Color());
  for (const [kind, token, light] of KINDS) {
    const colour = tokenOf(style, token);
    const grey = 0.2126 * colour.r + 0.7152 * colour.g + 0.0722 * colour.b;
    kinds[kind]?.copy(colour.lerp(new Color(grey, grey, grey), GREY).multiplyScalar(light));
  }
  const ground = tokenOf(style, "--color-space");
  const tone = tokenOf(style, "--color-warm");
  return { ground, kinds, tone, shadow: 0.28, farLight: 0.35 };
}

/** The window's size in its pixels, or a pixel with no page. */
export const screenOf = (page: Document | undefined) => ({
  width: page?.defaultView?.innerWidth ?? 1,
  height: page?.defaultView?.innerHeight ?? 1,
});
