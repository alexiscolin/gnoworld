// The full-screen chat's column of worlds (the video's left edge): one planet each, drawn from the world's own look, and its name
// under it (the video shows none: Alexis asked for it, 2026-11-06); the world in view marked.
import { hubWorldOf } from "@gnoworld/core";
import { Cluster, PlanetThumb } from "@gnoworld/ui";
import { useEffect, useState } from "react";
import { thumbsChunk } from "./thumbsChunk.ts";
import { RouterLink } from "../../routerLink.tsx";
import styles from "./Worlds.module.css";

export interface WorldsProps {
  worlds: readonly { slug: string; name: string; href: string; realms?: readonly string[] | undefined }[];
  /** The slug of the world in view. */
  current: string;
}

// The pictures' code is a chunk of its own, asked once the column is drawn: till it comes (or where it cannot) ui's disc stands in.
function useThumbs(): ((id: string) => string) | undefined {
  const [draw, setDraw] = useState<(id: string) => string>();
  useEffect(() => {
    let wanted = true;
    thumbsChunk().then(
      ({ worldThumb }) => {
        if (wanted) setDraw(() => worldThumb);
      },
      () => undefined,
    );
    return () => {
      wanted = false;
    };
  }, []);
  return draw;
}

export function Worlds({ worlds, current }: WorldsProps) {
  const thumb = useThumbs();
  return (
    <nav aria-label="Worlds" className={styles["list"]}>
      {/* One planet to a line: the column is no wider than one, so a Cluster wraps each onto its own. */}
      <Cluster as="ul" space="2xs" justify="center">
        {worlds.map((world) => (
          <li key={world.slug}>
            <RouterLink
              href={world.href}
              aria-label={world.name}
              aria-current={world.slug === current ? "page" : undefined}
              className={styles["world"]}
            >
              <PlanetThumb src={thumb?.(hubWorldOf(world)) ?? ""} name={world.name} decorative />
              <span className={["label", styles["name"]].join(" ")}>{world.name}</span>
            </RouterLink>
          </li>
        ))}
      </Cluster>
    </nav>
  );
}
