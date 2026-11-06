// The full-screen chat's column of worlds (the video's left edge, frame 80): the picture of each world's real planet at 44 px, the world in
// view ringed, no text under it; its name shows on hover (the tooltip) and names the link. A world with no picture keeps ui's disc.
import { hubWorldOf } from "@gnoworld/core";
import { Cluster, PlanetThumb, Tooltip } from "@gnoworld/ui";
import { pictureOf } from "../../lib/worldPictures.ts";
import { RouterLink } from "../../routerLink.tsx";
import styles from "./Worlds.module.css";

export interface WorldsProps {
  worlds: readonly { slug: string; name: string; href: string; realms?: readonly string[] | undefined }[];
  /** The slug of the world in view. */
  current: string;
  /** The worlds the reader follows, by their ids, the last followed first: they come after the Earth, as the universe's rail has them. */
  followed?: readonly string[];
}

// The picture at 44 px, loaded lazily as the column is (ui's disc is the rail's too, in the first screen, so it carries no such attributes).
function Planet({ name, src }: { name: string; src: string | undefined }) {
  if (src === undefined) return <PlanetThumb src="" name={name} decorative />;
  return (
    <span className={styles["planet"]}>
      <img src={src} alt="" width={44} height={44} loading="lazy" decoding="async" className={styles["picture"]} />
    </span>
  );
}

const NONE: readonly string[] = [];

/** The rail's order, as far as the chat knows it: the Earth, the worlds followed (the last followed first), then the rest as listed.
 * The rail's rest is by what is trending now, which the chat does not load. */
export function inRailOrder(worlds: WorldsProps["worlds"], followed: readonly string[]): WorldsProps["worlds"] {
  const rank = new Map(followed.map((id, at) => [id, at]));
  const place = (world: WorldsProps["worlds"][number]) =>
    world.slug === "earth" ? -1 : (rank.get(hubWorldOf(world)) ?? followed.length);
  return worlds.toSorted((a, b) => place(a) - place(b));
}

export function Worlds({ worlds, current, followed = NONE }: WorldsProps) {
  return (
    <nav aria-label="Worlds" className={styles["list"]}>
      {/* One planet to a line: the column is no wider than one, so a Cluster wraps each onto its own. */}
      <Cluster as="ul" space="2xs" justify="center">
        {inRailOrder(worlds, followed).map((world) => (
          <li key={world.slug}>
            <Tooltip label={world.name}>
              <RouterLink
                href={world.href}
                aria-label={world.name}
                aria-current={world.slug === current ? "page" : undefined}
                className={styles["world"]}
              >
                <Planet name={world.name} src={pictureOf(hubWorldOf(world))} />
              </RouterLink>
            </Tooltip>
          </li>
        ))}
      </Cluster>
    </nav>
  );
}
