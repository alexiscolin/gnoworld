// The full-screen chat's column of worlds (the video's left edge, frame 80): the picture of each world's real planet at 44 px, the world in
// view ringed, no text under it; its name shows on hover (the tooltip) and names the link. A world with no picture keeps ui's disc.
import { hubWorldOf } from "@gnoworld/core";
import { Cluster, Stack, Tooltip } from "@gnoworld/ui";
import { useState } from "react";
import { chunked } from "./Failing.tsx";
import { RouterLink } from "../../routerLink.tsx";
import { ErrorView, errorKind } from "../errors/index.ts";
import { useApp } from "../../storeContext.tsx";
import { listAhead } from "./roomsListed.ts";
import { WorldPlanet } from "../../WorldPlanet.tsx";
import { UnreadPill } from "./UnreadPill.tsx";
import { WorldsMore } from "./WorldsMore.tsx";
import styles from "./Worlds.module.css";

// The credits' dialog is the universe's own, its code asked at the first press: the column carries only the button.
const CreditsDialog = chunked(async () => ({ default: (await import("../credits/index.ts")).CreditsDialog }), {
  waiting: null,
  failed: (error) => <ErrorView kind={errorKind(error)} size="inline" />,
});

export interface WorldsProps {
  worlds: readonly { slug: string; name: string; href: string; realms?: readonly string[] | undefined }[];
  /** The slug of the world in view. */
  current: string;
  /** The worlds the reader follows, by their ids, the last followed first: they come after the Earth, as the universe's rail has them. */
  followed?: readonly string[];
  /** The universe the column is of: its id (the follows' key) and whether its paths carry no /net prefix. */
  universe: { id: string; isDefault: boolean };
  /** Each world's lines not yet seen, by its slug: a pill beside its planet, the world in view's left to its rooms. */
  unread?: Readonly<Record<string, number>> | undefined;
  /** Rows with each world's name in words, no column: a phone's drawer holds the worlds below the rooms. */
  rows?: boolean | undefined;
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

// The followed worlds the hubs do not hold: the rest of the column, which WorldsMore draws.
const beyond = ({ worlds, followed = NONE }: Pick<WorldsProps, "worlds" | "followed">) =>
  followed.filter((id) => !worlds.some((world) => hubWorldOf(world) === id));

// The textures' credit, which the pictures carry wherever they show (DESIGN-SYSTEM.md): the button and the universe's own dialog,
// asked at the first press.
function Credits({ className }: { className: string | undefined }) {
  const [asked, setAsked] = useState(false);
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className={`label ${className ?? ""}`}
        onClick={() => {
          setAsked(true);
          setOpen(true);
        }}
      >
        Credits
      </button>
      {asked ? (
        <CreditsDialog
          open={open}
          onClose={() => {
            setOpen(false);
          }}
        />
      ) : null}
    </>
  );
}

// A world as a row: its planet and its name, a link at the control's height; its unseen lines after the name. Under the rows, what the
// column holds past the hubs (the worlds followed, the places opened last, "+" to Discover) and the credits.
function WorldRows({ worlds, current, followed = NONE, universe, unread }: WorldsProps) {
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

export function Worlds(props: WorldsProps) {
  return props.rows === true ? <WorldRows {...props} /> : <Column {...props} />;
}

function Column({ worlds, current, followed = NONE, universe, unread }: WorldsProps) {
  const session = useApp(({ login }) => login.session);
  return (
    <nav aria-label="Worlds" className={[styles["list"], "fill-column"].join(" ")}>
      {/* One planet to a line: the column is no wider than one, so a Cluster wraps each onto its own. */}
      <Cluster as="ul" space="2xs" justify="center">
        {inRailOrder(worlds, followed).map((world) => (
          <li key={world.slug} className={styles["entry"]}>
            <Tooltip label={world.name}>
              <RouterLink
                href={world.href}
                onPointerEnter={() => {
                  listAhead(world.slug, session);
                }}
                aria-label={world.name}
                aria-current={world.slug === current ? "page" : undefined}
                className={styles["world"]}
              >
                <span className={styles["planet"]}>
                  <WorldPlanet world={hubWorldOf(world)} fallback="" name={world.name} decorative />
                </span>
              </RouterLink>
            </Tooltip>
            {world.slug === current ? null : <UnreadPill count={unread?.[world.slug] ?? 0} />}
          </li>
        ))}
      </Cluster>
      <WorldsMore universe={universe} followed={beyond({ worlds, followed })} />
      <Credits className={styles["credits"]} />
    </nav>
  );
}
