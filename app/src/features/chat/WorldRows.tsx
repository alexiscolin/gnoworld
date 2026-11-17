// The worlds as rows with each name in words, no column: what a phone's drawer holds below the rooms. Its code is asked once the drawer is
// drawn (chatWorlds.tsx), so a computer's chat never carries it.
import { hubWorldOf } from "@gnoworld/core";
import { Cluster, Stack } from "@gnoworld/ui";
import { RouterLink } from "../../routerLink.tsx";
import { useApp } from "../../storeContext.tsx";
import { WorldPlanet } from "../../WorldPlanet.tsx";
import { listAhead } from "./roomsListed.ts";
import { UnreadPill } from "./UnreadPill.tsx";
import { beyond, Credits, inRailOrder, NONE, type WorldsProps } from "./Worlds.tsx";
import { WorldsMore } from "./WorldsMore.tsx";
import styles from "./Worlds.module.css";

// A world as a row: its planet and its name, a link at the control's height; its unseen lines after the name. Under the rows, what the
// column holds past the hubs (the worlds followed, the places opened last, "+" to Discover) and the credits.
export function WorldRows({ worlds, current, followed = NONE, universe, unread }: WorldsProps) {
  const session = useApp(({ login }) => login.session);
  return (
    <nav aria-label="Worlds">
      <Stack as="ul" space="3xs">
        {inRailOrder(worlds, followed).map((world) => (
          <li key={world.slug}>
            <RouterLink
              href={world.href}
              onPointerEnter={() => {
                listAhead(world.slug, session);
              }}
              aria-current={world.slug === current ? "page" : undefined}
              className={styles["row"]}
            >
              <Cluster space="s" wrap="no" className={styles["rowBody"]}>
                <span className={styles["planet"]}>
                  <WorldPlanet world={hubWorldOf(world)} fallback="" name={world.name} decorative />
                </span>
                <span className="truncate">{world.name}</span>
                {world.slug === current ? null : <UnreadPill count={unread?.[world.slug] ?? 0} />}
              </Cluster>
            </RouterLink>
          </li>
        ))}
      </Stack>
      <WorldsMore universe={universe} followed={beyond({ worlds, followed })} />
      <Credits className={styles["creditsRow"]} />
    </nav>
  );
}
