// One bubble over the globe: who says what from where, the room it was said in as a pill, and a way into that room. The bubbles repeat the chat,
// so a screen reader skips their words; the link's own name says where it leads.
import { countryName, centreOf, cutText, regionAt, type Bubble } from "@gnoworld/core/bubbles";
import { Address, shortAddress } from "@gnoworld/schemas";
import { lazy, Suspense, type ComponentProps } from "react";
import rules from "../data/bubbles.json" with { type: "json" };
import { roomHref, roomLabel } from "./features/chat/names.ts";
import { spotOf } from "./features/universe/spot.ts";
import { followed } from "./lib/followed.ts";
import styles from "./EarthSigns.module.css";

// The bubbles' words, a chunk of their own: one loader for the lazy and the warm-up below (a dynamic import inside a component fails the React
// Compiler's build, as GoExplore.tsx says).
export const loadWords = () => import("./features/universe/BubbleWords.tsx");
const LazyWords = lazy(async () => ({ default: (await loadWords()).BubbleWords }));
const NAME_GRAPHEMES = 32;
const speaker = (account: string) =>
  Address.safeParse(account).success ? shortAddress(account) : cutText(account, NAME_GRAPHEMES);
const initial = (name: string) => Array.from(name)[0]?.toUpperCase() ?? "";
export function Mark({ at, ...rest }: { at: { lat: number; lon: number } | undefined } & ComponentProps<"li">) {
  return at === undefined ? null : <li data-lat={at.lat} data-lon={at.lon} {...rest} />;
}

export function BubbleSign({
  bubble,
  world,
  said,
  open,
}: {
  bubble: Bubble;
  world: string | undefined;
  said: number | undefined;
  open: (href: string) => void;
}) {
  const name = speaker(bubble.account);
  const at = world === undefined ? centreOf(bubble.country) : spotOf(world, bubble.country);
  const place =
    world === undefined ? countryName(bubble.country) : at === undefined ? undefined : regionAt(world, at).name;
  const { room } = bubble;
  const label = room === undefined ? undefined : roomLabel(room);
  const href = room === undefined ? undefined : roomHref(room);
  const inside = (
    <>
      <span className={styles["who"]}>{initial(name)}</span>
      <div>
        {/* The name and place whole, on two lines where the room's pill leaves them too little. */}
        <div className={`${String(styles["head"])} ${String(styles["headRow"])}`}>
          <span>{`${name} · ${place ?? ""}`}</span>
          {label === undefined ? null : (
            <span data-room="" className={styles["room"]}>
              {label}
            </span>
          )}
        </div>
        <p dir="auto" className={styles["words"]}>
          <Suspense fallback={null}>
            <LazyWords text={bubble.text} max={rules.maxChars} />
          </Suspense>
        </p>
      </div>
    </>
  );
  return (
    <Mark at={at} className={styles["anchor"]} data-mark="bubble" data-said={said}>
      {/* The words repeat the chat, so a screen reader skips them; the way into the room is a link with its own name. */}
      {href === undefined ? (
        <div className={styles["bubble"]} data-bubble="" aria-hidden="true">
          {inside}
        </div>
      ) : (
        <a
          href={href}
          className={styles["bubble"]}
          data-bubble=""
          aria-label={`Open ${label ?? ""}`}
          onClick={(event) => {
            followed(event, href, open);
          }}
        >
          <span aria-hidden="true" className={styles["inside"]}>
            {inside}
          </span>
        </a>
      )}
      <i className={styles["ping"]} />
    </Mark>
  );
}
