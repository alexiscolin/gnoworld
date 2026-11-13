import { GlyphAt } from "../icons/GlyphAt.tsx";
import type { IconName } from "../icons/Icon.tsx";
import styles from "./Badge.module.css";

export interface BadgeProps {
  /** On the band across the medal. */
  name: string;
  icon: IconName;
  tone: "primary" | "mine" | "warm" | "signal" | "danger";
  /** Filled in its tone once earned, dashed before. */
  earned: boolean;
  /** Under the medal, small: how far it is ("1/4"). */
  count?: string;
}

const TEETH = 18;
const OUTER = 40;
const INNER = 36.5;

const scallops = `M${Array.from({ length: TEETH * 2 }, (_, at) => {
  const angle = (at / (TEETH * 2)) * Math.PI * 2 - Math.PI / 2;
  const radius = at % 2 === 0 ? OUTER : INNER;
  return `${(Math.cos(angle) * radius).toFixed(2)},${(Math.sin(angle) * radius).toFixed(2)}`;
}).join("L")}Z`;

/** A challenge's badge, another family than a world's stamp: a scalloped medal, filled in its tone once earned and dashed before, its icon
 * and its name on a band. */
export function Badge({ name, icon, tone, earned, count }: BadgeProps) {
  return (
    <svg
      className={styles["badge"]}
      viewBox="-50 -50 100 100"
      role="img"
      aria-label={`${name}, ${earned ? "earned" : "not earned yet"}`}
      data-tone={tone}
      data-earned={earned ? "" : undefined}
    >
      <g fill="none" stroke="currentColor">
        <path className={styles["medal"]} d={scallops} strokeWidth={1.6} strokeDasharray={earned ? undefined : "3 3"} />
        <circle r={28} strokeWidth={0.8} opacity={0.6} />
        <GlyphAt name={icon} x={0} y={-6} size={22} />
      </g>
      <rect className={styles["band"]} x={-34} y={10} width={68} height={13} rx={3} />
      <text className={styles["name"]} textAnchor="middle" y={19.6} fontSize={7} letterSpacing={0.7}>
        {name.toUpperCase()}
      </text>
      {count === undefined ? null : (
        <text className={styles["count"]} textAnchor="middle" y={33} fontSize={6.5}>
          {count}
        </text>
      )}
    </svg>
  );
}
