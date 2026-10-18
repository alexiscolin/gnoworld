// The worlds slice 1 pre-renders (slice 5's data files replace the list), and the address of each.
import { data } from "react-router";

export interface World {
  /** Its name in a path: lower-case letters, digits and single hyphens, unique (worlds.test.ts). */
  slug: string;
  name: string;
  description: string;
}

export const WORLDS: readonly World[] = [
  {
    slug: "bubble",
    name: "Bubble",
    description:
      "Bubble, a world of gno.land: the BUBBLE token, its governance, and the games played with it on chain.",
  },
];

/** The world a path names; throws React Router's 404 when none has that name. */
export function findWorld(slug: string | undefined): World {
  const world = WORLDS.find((each) => each.slug === slug);
  if (!world) throw data(null, { status: 404 });
  return world;
}

/** A world's one address on the site: its links, its pre-rendered page and its canonical. */
export function worldPath(world: World): string {
  return `/w/${world.slug}`;
}
