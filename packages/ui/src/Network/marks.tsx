// The graph's centre and an empty side's words (Network.tsx): the centre's dot with its name, under it when too long for the dot;
// the words of a side with no dot.
import styles from "./Network.module.css";

export const CENTRE_R = 24;
/** The room the centre's name takes under it, when it is too long for its dot; the longest it is drawn. */
const NAMED = 18;
const NAME_MAX = 24;
const IN_DOT = 6;

/** A side's word, and what it says with no dot. */
interface Side {
  word: string;
  none?: string | undefined;
}

/** The height a centre's name adds under the graph: none when it fits its dot. */
export const nameHeight = (label: string): number => (label.length <= IN_DOT ? 0 : NAMED);

// A centre's name too long for its dot is written whole under it (cut at five letters, it read as nothing: "depo…").
export function Centre({ label, cx, cy, halo }: { label: string; cx: number; cy: number; halo: number }) {
  const inDot = label.length <= IN_DOT;
  return (
    <>
      <g className={styles["centre"]}>
        <circle cx={cx} cy={cy} r={CENTRE_R} />
        {inDot ? (
          <text x={cx} y={cy + 4} textAnchor="middle">
            {label}
          </text>
        ) : null}
      </g>
      {inDot ? null : (
        <text className={styles["name"]} x={cx} y={cy + halo + 14} textAnchor="middle">
          {label.length > NAME_MAX ? `${label.slice(0, NAME_MAX - 1)}…` : label}
        </text>
      )}
    </>
  );
}

// What a side with no dot says: on that side, level with the centre and close to it, where its curves would start (Alexis, 2026-11-11:
// "aligne-le mieux", the words read with the centre); with both sides empty, under the centre.
export function Nones({
  left,
  right,
  empty,
  cx,
  near,
  cy,
  foot,
}: {
  left: Side;
  right: Side;
  empty: [boolean, boolean];
  cx: number;
  near: number;
  cy: number;
  foot: number;
}) {
  const said = [
    ...(empty[0] ? [left.none ?? `${left.word} nothing`] : []),
    ...(empty[1] ? [right.none ?? `no ${right.word} yet`] : []),
  ];
  if (said.length === 0) return null;
  const [x, anchor, y]: [number, "start" | "middle" | "end", number] =
    empty[0] && empty[1] ? [cx, "middle", foot] : empty[0] ? [cx - near, "end", cy + 4] : [cx + near, "start", cy + 4];
  return (
    <text className={styles["none"]} x={x} y={y} textAnchor={anchor}>
      {said.join(" · ")}
    </text>
  );
}
