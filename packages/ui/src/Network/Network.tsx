import type { CSSProperties } from "react";
import { Cluster, Stack } from "../compositions/index.ts";
import styles from "./Network.module.css";
import { useSeen } from "./useSeen.ts";

/** The most dots in a lane: the rest is a number in the legend. */
const LANE_MAX = 7;
/** A dot and the step to the next: 12 px of air between two dots (the proposal packs them 8 px apart). */
const GAP = 34;
/** The air kept at the graph's edges, and between a dot and the centre's halo. */
const MARGIN = 8;
const HALO_R = 36;
const CLEAR = 12;
const CENTRE_R = 24;
/** The room the words of an empty side take under the centre. */
const SAID = 22;
const NODE_H = 22;
/** The longest word in a dot. */
const WORD_MAX = 14;

export interface NetworkNode {
  id: string;
  /** The word in the dot, short. */
  label: string;
  /** A realm is a round pill in the world's colour; a pure package a square-cornered, empty one. */
  kind?: "realm" | "pure";
  /** What it says in full once picked: its path. */
  detail?: string;
  /** A figure at the dot's end (×3). */
  count?: number;
}

export interface NetworkProps {
  /** Names the graph for assistive technology. */
  label: string;
  /** The one in the middle. */
  centre: NetworkNode;
  /** The two lanes, left and right, each with its word in the legend and its total when it is more than the dots drawn (the first 7 are drawn). */
  left: { word: string; nodes: readonly NetworkNode[]; total?: number; none?: string };
  right: { word: string; nodes: readonly NetworkNode[]; total?: number; none?: string };
  /** The node picked, which stands out and says its path. */
  selected?: string | undefined;
  onSelect?: (id: string) => void;
  /** What the foot says once a node is picked, after its path ("click again to open it"). */
  pickedHint?: string;
}

// The tick type is 6.6 px a letter; a dot keeps 10 px of air before its word, 8 after its count and 6 between them: a word is cut where
// the room the count leaves ends, so the two never touch.
const LETTER = 6.6;
const cut = (word: string, width: number, count: number | undefined) => {
  const counted = count === undefined ? 0 : (String(count).length + 1) * LETTER + 6;
  const room = Math.min(WORD_MAX, Math.max(3, Math.floor((width - 18 - counted) / LETTER)));
  return word.length > room ? `${word.slice(0, room - 1)}…` : word;
};

interface LaneProps {
  nodes: readonly NetworkNode[];
  side: -1 | 1;
  /** The centre's height in the drawing. */
  cy: number;
  width: number;
  /** The graph's own width: the dots keep their size, the curves take the room. */
  span: number;
  selected: string | undefined;
  onSelect: ((id: string) => void) | undefined;
}

// One lane: its curves from the centre first, then its dots, each a button when something answers a pick.
function Lane({ nodes, side, cy, width, span, selected, onSelect }: LaneProps) {
  const cx = span / 2;
  const gap = GAP;
  const y0 = cy - ((nodes.length - 1) * gap) / 2;
  const x = side < 0 ? MARGIN : span - MARGIN - width;
  const edgeAt = side < 0 ? x + width : x;
  const centreAt = side < 0 ? cx - CENTRE_R : cx + CENTRE_R;
  const mid = (edgeAt + centreAt) / 2;
  return (
    <>
      {nodes.map((node, i) => {
        const y = y0 + i * gap;
        const d =
          side < 0
            ? `M${String(edgeAt)} ${String(y)} C${String(mid)} ${String(y)} ${String(mid)} ${String(cy)} ${String(centreAt)} ${String(cy)}`
            : `M${String(centreAt)} ${String(cy)} C${String(mid)} ${String(cy)} ${String(mid)} ${String(y)} ${String(edgeAt)} ${String(y)}`;
        return (
          <path key={node.id} className={styles["edge"]} style={{ "--j": i } as CSSProperties} pathLength={1} d={d} />
        );
      })}
      {nodes.map((node, i) => {
        const y = y0 + i * gap;
        const pure = node.kind === "pure";
        return (
          <g
            key={node.id}
            className={styles["node"]}
            data-kind={node.kind ?? "realm"}
            {...(onSelect === undefined
              ? {}
              : {
                  role: "button",
                  tabIndex: 0,
                  "aria-label": node.detail ?? node.label,
                  "aria-pressed": selected === node.id,
                  onClick: () => {
                    onSelect(node.id);
                  },
                  onKeyDown: (event: { key: string }) => {
                    if (event.key === "Enter" || event.key === " ") onSelect(node.id);
                  },
                })}
          >
            <title>{node.detail ?? node.label}</title>
            <rect x={x} y={y - NODE_H / 2} width={width} height={NODE_H} rx={pure ? 5 : NODE_H / 2} />
            <text x={x + 10} y={y + 3.5}>
              {cut(node.label, width, node.count)}
            </text>
            {node.count === undefined ? null : (
              <text x={x + width - 8} y={y + 3.5} textAnchor="end">
                ×{node.count}
              </text>
            )}
          </g>
        );
      })}
    </>
  );
}

// What a side with no dot says, under the centre where it always has the room (beside it a narrow column cut it).
function Nones({
  left,
  right,
  empty,
  cx,
  y,
}: Pick<NetworkProps, "left" | "right"> & { empty: [boolean, boolean]; cx: number; y: number }) {
  const said = [
    ...(empty[0] ? [left.none ?? `${left.word} nothing`] : []),
    ...(empty[1] ? [right.none ?? `no ${right.word} yet`] : []),
  ];
  return said.length === 0 ? null : (
    <text className={styles["none"]} x={cx} y={y} textAnchor="middle">
      {said.join(" · ")}
    </text>
  );
}

// What the graph counts, the halo beats again when it changes.
const totals = (left: NetworkProps["left"], right: NetworkProps["right"]) =>
  `${String(left.total ?? left.nodes.length)}/${String(right.total ?? right.nodes.length)}`;

/** A minigraph of a place and what is linked to it: the centre, up to 7 dots on its left and 7 on its right joined by curves, a legend
 * with each side's total and a foot that names the dot picked. Each dot is a button when something answers a pick. Positions are
 * computed from the order, so the same links draw the same graph. */
export function Network({ label, centre, left, right, selected, onSelect, pickedHint }: NetworkProps) {
  const { ref, seen, span } = useSeen();
  const lanes = [left.nodes.slice(0, LANE_MAX), right.nodes.slice(0, LANE_MAX)] as const;
  const rows = Math.max(lanes[0].length, lanes[1].length);
  const empty: [boolean, boolean] = [lanes[0].length === 0, lanes[1].length === 0];
  // The drawing is as tall as its longest lane (the halo's size at least), the words of an empty side under the centre.
  const core = Math.max(rows * GAP, 2 * HALO_R);
  const height = core + 2 * MARGIN + (empty[0] || empty[1] ? SAID : 0);
  // The proposal's rule: the dots take what the centre leaves, at most 120 px.
  const width = Math.min(120, Math.floor((span - 96) / 2));
  // The halo gives up room before a dot has to: it keeps CLEAR px of air to the dots in a narrow column.
  const halo = Math.min(HALO_R, Math.max(CENTRE_R + 4, span / 2 - MARGIN - width - CLEAR));
  const cx = span / 2;
  const cy = MARGIN + core / 2;
  const picked = [...lanes[0], ...lanes[1]].find((node) => node.id === selected);
  return (
    <Stack space="2xs">
      <svg
        ref={ref}
        className={styles["net"]}
        data-seen={seen ? "" : undefined}
        viewBox={`0 0 ${String(span)} ${String(height)}`}
        role="group"
        aria-label={label}
      >
        <circle key={totals(left, right)} className={styles["halo"]} cx={cx} cy={cy} r={halo} />
        <Lane nodes={lanes[0]} side={-1} cy={cy} width={width} span={span} selected={selected} onSelect={onSelect} />
        <Lane nodes={lanes[1]} side={1} cy={cy} width={width} span={span} selected={selected} onSelect={onSelect} />
        <g className={styles["centre"]}>
          <circle cx={cx} cy={cy} r={CENTRE_R} />
          <text x={cx} y={cy + 4} textAnchor="middle">
            {centre.label.length > 6 ? `${centre.label.slice(0, 5)}…` : centre.label}
          </text>
        </g>
        <Nones left={left} right={right} empty={empty} cx={cx} y={cy + HALO_R + 16} />
      </svg>
      {/* The two sides of the legend 8 px apart (the proposal's). */}
      <div className={styles["legend"]}>
        <Cluster space="2xs">
          <span>
            ← {left.word} <b>{left.total ?? left.nodes.length}</b>
          </span>
          <span>
            {right.word} <b>{right.total ?? right.nodes.length}</b> →
          </span>
        </Cluster>
      </div>
      <p className={styles["legend"]}>square = pure package, round = realm</p>
      <p className={styles["caption"]}>
        {picked === undefined
          ? "Select a node to read its path."
          : `${picked.detail ?? picked.label}${pickedHint === undefined ? "" : ` · ${pickedHint}`}`}
      </p>
    </Stack>
  );
}
