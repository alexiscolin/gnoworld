import { Fragment, useId } from "react";
import { Icon } from "../icons/Icon.tsx";
import { ORDERS, partsFrom } from "./parts.ts";
import styles from "./Avatar.module.css";

export interface AvatarProps {
  /** The account's address, the face's one source: anything that is not one draws the night disc. */
  address: string;
  /** Who it is, said for assistive technology; the face never says it. */
  name: string;
  size?: "s" | "m" | "l";
  kind?: "person" | "assistant" | "bot";
  /** Here now: a dot, and the words in its name. */
  here?: boolean;
  /** Speaking: a ring, and the word in its name. */
  speaking?: boolean;
  /** Beside a name that says it already, as in a row: the face says only here and speaking. */
  decorative?: boolean;
}

const KIND = { person: "", assistant: ", assistant", bot: ", bot" } as const;

// What assistive technology says: the name and its kind, unless a name beside says them, then here and
// speaking, which only the avatar shows (F320).
function said({ name, kind = "person", here, speaking, decorative }: AvatarProps) {
  const states = [here === true ? "here now" : "", speaking === true ? "speaking" : ""];
  return [decorative === true ? "" : `${name}${KIND[kind]}`, ...states].filter((part) => part !== "").join(", ");
}

// A point of the face, to the hundredth of a unit: finer than a pixel at 48 px.
const xy = ([x, y]: readonly [number, number]) => `${x.toFixed(2)},${y.toFixed(2)}`;

// The address's clouds in its hues, its constellation over them, the bright star with its halo; for what
// is not an address, nothing: the night disc alone.
function Nebula({ address }: { address: string }) {
  const id = useId();
  const parts = partsFrom(address);
  if (parts === null) return null;
  const { hues, clouds, stars, order, bright } = parts;
  return (
    <>
      <defs>
        {hues.map((hue, i) => {
          const [cx = 0.5, cy = 0.5] = clouds[i] ?? [];
          const colour = `hsl(${hue.toFixed(1)} 85% 60%)`;
          return (
            <radialGradient key={hue} id={`${id}-${String(i)}`} cx={cx.toFixed(3)} cy={cy.toFixed(3)} r="0.6">
              <stop offset="0" stopColor={colour} />
              <stop offset="1" stopColor={colour} stopOpacity="0" />
            </radialGradient>
          );
        })}
      </defs>
      {hues.map((hue, i) => (
        <circle key={hue} cx="24" cy="24" r="24" fill={`url(#${id}-${String(i)})`} />
      ))}
      <polyline className={styles["line"]} points={ORDERS[order]?.map((i) => xy(stars[i] ?? [24, 24])).join(" ")} />
      {stars.map(([x, y], i) => {
        const [cx, cy] = [x.toFixed(2), y.toFixed(2)];
        return (
          <Fragment key={`${cx},${cy}`}>
            {i === bright ? <circle className={styles["halo"]} cx={cx} cy={cy} r="4.5" /> : null}
            <circle
              className={styles["star"]}
              data-star={i === bright ? "bright" : ""}
              cx={cx}
              cy={cy}
              r={i === bright ? "2.3" : "1.4"}
            />
          </Fragment>
        );
      })}
    </>
  );
}

// Jarvis's orb: a violet glow, lit from its upper start (decision 3; never mint).
function Orb() {
  const id = useId();
  return (
    <>
      <defs>
        <radialGradient id={`${id}-orb`} cx="0.4" cy="0.35" r="0.55">
          <stop offset="0" className={styles["core"]} />
          <stop offset="0.6" className={styles["glow"]} />
          <stop offset="1" className={styles["glow"]} stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle data-orb="" cx="24" cy="24" r="20" fill={`url(#${id}-orb)`} />
    </>
  );
}

// The face on its night disc, the same at every size: the sheet scales it. The night is the picture's
// own, so forced colours, which leave a picture as drawn, keep it (F319).
function Face({ address, kind }: { address: string; kind: "person" | "assistant" }) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" className={styles["face"]}>
      <rect className={styles["night"]} width="48" height="48" />
      {kind === "assistant" ? <Orb /> : <Nebula address={address} />}
    </svg>
  );
}

/** Who someone is at a glance, drawn from their address alone; their name says who they are. */
export function Avatar(props: AvatarProps) {
  const { address, size = "m", kind = "person", here, speaking } = props;
  const label = said(props);
  const named = label === "" ? { "aria-hidden": true } : { role: "img", "aria-label": label };
  return (
    <span
      className={styles["avatar"]}
      {...named}
      data-size={size}
      data-kind={kind}
      data-speaking={speaking === true ? "" : undefined}
    >
      {kind === "bot" ? <Icon name="code" /> : <Face address={address} kind={kind} />}
      <span className={styles["presence"]} data-presence={here === true ? "" : undefined} />
    </span>
  );
}
