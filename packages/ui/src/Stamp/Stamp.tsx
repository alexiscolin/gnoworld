import { Stack } from "../compositions/index.ts";
import { GlyphAt } from "../icons/GlyphAt.tsx";
import type { IconName } from "../icons/Icon.tsx";
import { outline, stampLook } from "./look.ts";
import styles from "./Stamp.module.css";

export interface StampProps {
  /** What the mark is drawn from: the world's id, so two worlds of one name never share a mark. */
  seed: string;
  name: string;
  /** The day it was stamped, as the app writes days. */
  day: string;
  /** The star system the world is in. */
  system: string;
  /** The icon of the world's kind. */
  icon?: IconName;
  /** Charted first: gold, with a star. */
  gold?: boolean;
}

/** A visit's stamp: the world's own mark, its outline, proportions, tilt, inner dashes and ink from its seed, the icon of its kind, its name,
 * its day and its system; gold with a star where it was charted first. */
export function Stamp({ seed, name, day, system, icon = "planet", gold = false }: StampProps) {
  const look = stampLook(seed);
  const words = name.toUpperCase();
  const said = `${name}, ${system}, stamped ${day}${gold ? ", charted first" : ""}`;
  return (
    <div className={styles["stamp"]}>
      <Stack space="3xs">
        <svg
          className={styles["mark"]}
          viewBox="-50 -50 100 100"
          role="img"
          aria-label={said}
          color={`hsl(${String(look.hue)} 52% 72%)`}
          data-gold={gold ? "" : undefined}
        >
          <g transform={`rotate(${look.tilt.toFixed(1)})`} fill="none" stroke="currentColor">
            <path d={outline(look, 1)} fill="currentColor" fillOpacity={0.06} strokeWidth={1.6} />
            <path d={outline(look, 0.86)} strokeWidth={0.8} strokeDasharray={look.dash} opacity={0.7} />
            <GlyphAt name={icon} x={0} y={-15} size={20} />
            <text
              className={styles["words"]}
              textAnchor="middle"
              y={8}
              fontSize={8.6}
              letterSpacing={0.9}
              textLength={Math.min(look.rx * 1.45, 6.4 * words.length)}
              lengthAdjust="spacingAndGlyphs"
            >
              {words}
            </text>
            <text
              className={styles["words"]}
              textAnchor="middle"
              y={20}
              fontSize={6.6}
              letterSpacing={0.8}
              opacity={0.85}
            >
              {day.toUpperCase()}
            </text>
            <text
              className={styles["words"]}
              textAnchor="middle"
              y={29}
              fontSize={5.4}
              letterSpacing={0.5}
              opacity={0.6}
            >
              {system.toUpperCase()}
            </text>
            {gold ? <GlyphAt name="star" x={look.rx * 0.62} y={-look.ry * 0.62} size={12} /> : null}
          </g>
        </svg>
        <span className={["meta", "truncate", styles["name"]].join(" ")}>{name}</span>
      </Stack>
    </div>
  );
}
