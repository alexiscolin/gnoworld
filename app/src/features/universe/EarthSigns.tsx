// The signs over the globe, as HTML anchored to the ground (ADR-0001 §7; frames 43 to 55, 85): who says what from where, each country's hour,
// the far side's counts, the side rooms. Bubbles repeat the chat, so screen readers skip them; a pin is a link, and a room with no place stays in
// the chat's list.
import { countryName, centreOf, cutText, type Bubble, type Count, type Trend } from "@gnoworld/core/bubbles";
import { Address, shortAddress } from "@gnoworld/schemas";
import { Cluster, Stack } from "@gnoworld/ui";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ComponentProps,
  type MouseEvent,
} from "react";
import rules from "../../../data/bubbles.json" with { type: "json" };
import places from "../../../data/earthRooms.json" with { type: "json" };
import { followed } from "../../lib/followed.ts";
import type { Ground } from "../../scene/earth/marks.ts";
import type { EarthPage } from "./host.ts";
import { marksOf, useUnderRing } from "./signMarks.ts";
import { Signs, type Pin, type SignsDeps } from "./signs.ts";
import styles from "./EarthSigns.module.css";

const NAME_GRAPHEMES = 32;
const MOST_COUNTS = 3;

const speaker = (account: string) =>
  Address.safeParse(account).success ? shortAddress(account) : cutText(account, NAME_GRAPHEMES);
const initial = (name: string) => Array.from(name)[0]?.toUpperCase() ?? "";
const percent = (value: number) => `${value > 0 ? "+" : ""}${String(value)}% · 1 h`;
const countLine = ({ country, count, far }: Count) =>
  `${countryName(country) ?? country} · ${String(count)}${far ? ", far side" : ""}`;

function Mark({ at, ...rest }: { at: { lat: number; lon: number } | undefined } & ComponentProps<"li">) {
  return at === undefined ? null : <li data-lat={at.lat} data-lon={at.lon} {...rest} />;
}

function BubbleSign({ bubble }: { bubble: Bubble }) {
  const name = speaker(bubble.account);
  return (
    <Mark at={centreOf(bubble.country)} className={styles["anchor"]} data-mark="bubble">
      <div className={styles["bubble"]} data-bubble="">
        <span className={styles["who"]}>{initial(name)}</span>
        <div>
          <div className={`truncate ${String(styles["head"])}`}>
            {name} · {countryName(bubble.country)}
          </div>
          <p dir="auto" className={styles["words"]}>
            {bubble.text}
          </p>
        </div>
      </div>
      <i className={styles["ping"]} />
    </Mark>
  );
}

function TrendSign({ trend }: { trend: Trend }) {
  return (
    <Mark
      at={centreOf(trend.country)}
      className={styles["anchor"]}
      data-mark="spot"
      data-trend={trend.percent > 0 ? "up" : "down"}
    >
      <i className={styles["rings"]} />
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

/** The signs of the page's Earth. */
export function PageSigns({ page, ground }: { page: EarthPage; ground: Ground }) {
  const deps = { store: page.store, ground, rules, places };
  return <EarthSigns deps={deps} open={page.open} />;
}

export function EarthSigns({ deps, open }: { deps: SignsDeps; open: (href: string) => void }) {
  const [signs] = useState(() => new Signs(deps));
  const { bubbles, counts, trends, pins } = useSyncExternalStore(signs.subscribe, signs.snapshot);
  const boxRef = useRef<HTMLDivElement>(null);
  const { ground } = deps;
  useEffect(() => signs.start(), [signs]);
  useLayoutEffect(() => {
    const elements = boxRef.current?.querySelectorAll<HTMLElement>("[data-mark]") ?? [];
    ground.setMarks(marksOf(elements));
  }, [ground, bubbles, trends, pins]);
  useEffect(
    () => () => {
      ground.setMarks([]);
    },
    [ground],
  );
  useUnderRing(boxRef);
  return (
    <div ref={boxRef} className={styles["signs"]} data-signs="">
      <div aria-hidden="true">
        <Stack as="ul">
          {trends.map((trend) => (
            <TrendSign key={trend.country} trend={trend} />
          ))}
          {bubbles.map((bubble) => (
            <BubbleSign key={bubble.id} bubble={bubble} />
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
