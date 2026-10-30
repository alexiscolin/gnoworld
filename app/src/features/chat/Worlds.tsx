// The full-screen chat's column of worlds (the video's left edge): one planet each, the world in view marked. A world's
// picture is the site's (ui's PlanetThumb): slice 7 draws each from its own planet.
import { Cluster, PlanetThumb } from "@gnoworld/ui";
import { RouterLink } from "../../routerLink.tsx";
import styles from "./Worlds.module.css";

export interface WorldsProps {
  worlds: readonly { slug: string; name: string; href: string; src: string }[];
  /** The slug of the world in view. */
  current: string;
}

export function Worlds({ worlds, current }: WorldsProps) {
  return (
    <nav aria-label="Worlds" className={styles["list"]}>
      {/* One planet to a line: the column is no wider than one, so a Cluster wraps each onto its own. */}
      <Cluster as="ul" space="3xs" justify="center">
        {worlds.map((world) => (
          <li key={world.slug}>
            <RouterLink
              href={world.href}
              aria-label={world.name}
              aria-current={world.slug === current ? "page" : undefined}
              className={styles["world"]}
            >
              <PlanetThumb src={world.src} name={world.name} decorative />
            </RouterLink>
          </li>
        ))}
      </Cluster>
    </nav>
  );
}
