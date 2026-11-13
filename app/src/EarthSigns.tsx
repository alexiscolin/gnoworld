// The signs over the globe, as HTML anchored to the ground (ADR-0001 §7; frames 43 to 55, 85): who says what from where, each country's hour,
// the far side's counts, the side rooms. Bubbles repeat the chat, so screen readers skip them; a pin is a link, and a room with no place stays in
// the chat's list. On another world (`world`, D565) the bubbles alone stand, each on its speaker's own spot (spot.ts).
import { countryName, centreOf, type Count, type Trend } from "@gnoworld/core/bubbles";
import { Cluster, sightRef, Stack } from "@gnoworld/ui";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type MouseEvent,
} from "react";
import rules from "../data/bubbles.json" with { type: "json" };
import places from "../data/earthRooms.json" with { type: "json" };
import { BubbleSign, loadWords, Mark } from "./BubbleSign.tsx";
import { followed } from "./lib/followed.ts";
import type { StoreApi } from "zustand/vanilla";
import type { AppState } from "./store/index.ts";
import { marksOf, useUnderRing, worldFit } from "./features/universe/signMarks.ts";
import { Signs, type Pin, type SignsDeps } from "./features/universe/signs.ts";
import { ground as pageGround } from "./earthGround.ts";
import type { Ground } from "./space/earth/ground.ts";
import styles from "./EarthSigns.module.css";

const MOST_COUNTS = 3;

const percent = (value: number) => `${value > 0 ? "+" : ""}${String(value)}% · 1 h`;
const countLine = ({ country, count, far }: Count) =>
  `${countryName(country) ?? country} · ${String(count)}${far ? ", far side" : ""}`;

function TrendSign({ trend }: { trend: Trend }) {
  return (
    <Mark
      at={centreOf(trend.country)}
      className={styles["anchor"]}
      data-mark="spot"
      data-trend={trend.percent > 0 ? "up" : "down"}
      aria-hidden="true"
    >
      <i key={trend.percent} ref={sightRef} className={styles["rings"]} />
      <b data-dot="" className={styles["dot"]} />
      <span className={styles["pill"]}>{percent(trend.percent)}</span>
    </Mark>
  );
}

function PinSign({ pin, open }: { pin: Pin; open: (href: string) => void }) {
  const opened = (event: MouseEvent) => {
    followed(event, pin.href, open);
  };
  return (
    <Mark at={pin} className={styles["anchor"]} data-mark="spot">
      <a href={pin.href} className={styles["pin"]} onClick={opened}>
        {pin.label}
      </a>
    </Mark>
  );
}

type Vars = CSSProperties & Record<`--${string}`, string>;

// A small view's signs are drawn at this share of their size: its box is a third the window's width.
const INSIDE_SCALE = 0.62;
const INSIDE: Vars = { "--_k": String(INSIDE_SCALE) };

/** The Earth's signs, through the page's `store` and router (`open`), on the ground space draws (space.ts's `ground`); `ground`, a small
 * view's own, stands them inside its box instead, over its canvas, smaller. `world`, a world that is not the Earth and its room, stands that
 * room's bubbles on it instead. */
export function PageSigns({
  store,
  open,
  ground,
  world,
}: {
  store: StoreApi<AppState>;
  open: (href: string) => void;
  ground?: Ground;
  world?: { id: string };
}) {
  const [deps] = useState(() => ({
    store,
    ground: ground ?? pageGround,
    rules,
    places: world === undefined ? places : [],
    ...(world === undefined ? {} : { world }),
  }));
  return <EarthSigns deps={deps} open={open} inside={ground !== undefined} />;
}

export function EarthSigns({ deps, open, inside }: { deps: SignsDeps; open: (href: string) => void; inside: boolean }) {
  const [signs] = useState(() => new Signs(deps));
  // The build's pre-render holds no sign: the first snapshot, empty, as the page's first draw.
  const { bubbles, counts, trends, pins } = useSyncExternalStore(signs.subscribe, signs.snapshot, signs.snapshot);
  const boxRef = useRef<HTMLDivElement>(null);
  const { ground, world } = deps;
  useEffect(() => signs.start(), [signs]);
  // The bubbles' words come in a chunk of their own: asked as soon as the signs are up, so a bubble shows with its words, never without (D13014).
  useEffect(() => {
    let wanted = true;
    // A load that fails is asked again by the bubble's own lazy; the effect's end only stops caring.
    loadWords().then(
      () => undefined,
      (error: unknown) => {
        if (wanted) reportError(error);
      },
    );
    return () => {
      wanted = false;
    };
  }, []);
  useLayoutEffect(() => {
    const elements = boxRef.current?.querySelectorAll<HTMLElement>("[data-mark]") ?? [];
    const reach = boxRef.current?.clientWidth ?? 0;
    const fit = inside ? { reach, scale: INSIDE_SCALE, floor: 0 } : world === undefined ? undefined : worldFit();
    ground.setMarks(marksOf(elements, fit));
  }, [ground, inside, world, bubbles, trends, pins]);
  useEffect(
    () => () => {
      ground.setMarks([]);
    },
    [ground],
  );
  useUnderRing(boxRef, inside);
  return (
    <div
      ref={boxRef}
      className={styles["signs"]}
      data-signs=""
      data-inside={inside ? "" : undefined}
      style={inside ? INSIDE : undefined}
    >
      <div>
        <Stack as="ul">
          {trends.map((trend) => (
            <TrendSign key={trend.country} trend={trend} />
          ))}
          {bubbles.map((bubble) => (
            <BubbleSign key={bubble.id} bubble={bubble} world={world?.id} said={signs.said(bubble.id)} open={open} />
          ))}
        </Stack>
      </div>
      {pins.length === 0 ? null : (
        <nav aria-label="Rooms on the globe">
          <Stack as="ul">
            {pins.map((pin) => (
              <PinSign key={pin.room} pin={pin} open={open} />
            ))}
          </Stack>
        </nav>
      )}
      {counts.length === 0 ? null : (
        <div aria-hidden="true" className={styles["counts"]}>
          <Cluster as="ul" space="2xs">
            {counts.slice(0, MOST_COUNTS).map((count) => (
              <li key={count.country} className={styles["count"]}>
                {countLine(count)}
              </li>
            ))}
          </Cluster>
        </div>
      )}
    </div>
  );
}
