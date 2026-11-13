// The column of worlds past the hubs, as Discord's servers: the worlds this reader follows, then the realms opened last, each its real
// planet and a remove control on hover, then a "+" that opens the search's Discover to find more. The device keeps the places.
import { realmName, REALM_PREFIX, realmRoute, stampKey, worldIdOf } from "@gnoworld/core";
import { Cluster, IconButton, Tooltip } from "@gnoworld/ui";
import { useReducer, useSyncExternalStore, type ReactNode } from "react";
import type { Worlds } from "@gnoworld/schemas/indexer";
import { useLocation } from "react-router";
import { forgetPath, recentPaths } from "../../lib/recents.ts";
import { universePrefix } from "../../places.ts";
import { realmAt } from "../../realmAt.ts";
import { RouterLink } from "../../routerLink.tsx";
import { realmPageHref } from "../../lib/realmPage.ts";
import { SEARCH } from "../../space/openEvent.ts";
import { useWorldsFile } from "../../worldsFile.ts";
import { useFollow } from "../follow/index.ts";
import { WorldPlanet } from "../../WorldPlanet.tsx";
import styles from "./Worlds.module.css";

// Read on the device after the page wakes: the server's page and the first draw hold none, so hydration matches.
const kept = () => recentPaths().join("\n");
const none = () => "";
const quiet = () => () => undefined;

/** One place of the column: its planet as a link, ringed when in view, and the control that removes it from the list. */
function Place({ name, id, href, remove }: { name: string; id: string; href: string; remove: () => void }) {
  const { pathname } = useLocation();
  return (
    <li className={styles["removable"]}>
      <Tooltip label={name}>
        <RouterLink
          href={href}
          aria-label={name}
          aria-current={href === pathname ? "page" : undefined}
          className={styles["world"]}
        >
          <span className={styles["planet"]}>
            <WorldPlanet world={id} fallback="" name={name} decorative />
          </span>
        </RouterLink>
      </Tooltip>
      <span className={styles["remove"]}>
        <IconButton icon="close" size="xs" label={`Remove ${name} from the list`} onClick={remove} />
      </span>
    </li>
  );
}

// A followed world is named and linked as the search's cards do: its world's short name and its first realm's page (the file's, once it comes).
function Followed({
  id,
  universe,
  base,
  file,
}: {
  id: string;
  universe: string;
  base: string;
  file: Worlds["worlds"] | undefined;
}) {
  const { toggle } = useFollow("worlds", stampKey(universe, id));
  const path = file?.find((world) => world.id === id)?.realms[0]?.path ?? `${REALM_PREFIX}${id}`;
  return (
    <Place
      name={id.split("/").at(-1) ?? id}
      id={id}
      href={realmPageHref(path) ?? realmRoute(path, base)}
      remove={toggle}
    />
  );
}

export function WorldsMore({
  followed,
  universe,
}: {
  followed: readonly string[];
  universe: { id: string; isDefault: boolean };
}): ReactNode {
  const file = useWorldsFile(followed.length > 0);
  const [, again] = useReducer((n: number) => n + 1, 0);
  const paths = useSyncExternalStore(quiet, kept, none).split("\n");
  const realms = paths.flatMap((path) => {
    const found = path === "" ? undefined : realmAt(path);
    return found === undefined || followed.includes(worldIdOf(found.realm))
      ? []
      : [{ path, id: worldIdOf(found.realm), name: realmName(found.realm).name }];
  });
  return (
    <>
      <hr className={styles["rule"]} />
      <Cluster as="ul" space="2xs" justify="center">
        {followed.map((id) => (
          <Followed key={id} id={id} file={file} universe={universe.id} base={universePrefix(universe)} />
        ))}
        {realms.map(({ path, id, name }) => (
          <Place
            key={path}
            name={name}
            id={id}
            href={path}
            remove={() => {
              forgetPath(path);
              again();
            }}
          />
        ))}
        <li>
          <Tooltip label="Find more worlds">
            <IconButton
              icon="plus"
              label="Find more worlds"
              onClick={() => {
                window.dispatchEvent(new CustomEvent(SEARCH, { detail: "" }));
              }}
            />
          </Tooltip>
        </li>
      </Cluster>
    </>
  );
}
