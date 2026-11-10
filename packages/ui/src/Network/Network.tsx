import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Stack } from "../compositions/index.ts";
import styles from "./Network.module.css";

/** The most dots in a lane: the rest is a number in the legend. */
const LANE_MAX = 7;
const WIDTH = 320;
const GAP = 30;
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
  left: { word: string; nodes: readonly NetworkNode[]; total?: number };
  right: { word: string; nodes: readonly NetworkNode[]; total?: number };
  /** The node picked, which stands out and says its path. */
  selected?: string | undefined;
  onSelect?: (id: string) => void;
  /** What the foot says once a node is picked, after its path ("click again to open it"). */
  pickedHint?: string;
}

const cut = (word: string) => (word.length > WORD_MAX ? `${word.slice(0, WORD_MAX - 1)}…` : word);

interface LaneProps {
  nodes: readonly NetworkNode[];
  side: -1 | 1;
  height: number;
  width: number;
  selected: string | undefined;
  onSelect: ((id: string) => void) | undefined;
}

// One lane: its curves from the centre first, then its dots, each a button when something answers a pick.
function Lane({ nodes, side, height, width, selected, onSelect }: LaneProps) {
  const cy = height / 2;
  const cx = WIDTH / 2;
  const gap = Math.min(GAP, (height - 24) / Math.max(nodes.length, 1));
  const y0 = cy - ((nodes.length - 1) * gap) / 2;
  const x = side < 0 ? 4 : WIDTH - 4 - width;
  const edgeAt = side < 0 ? x + width : x;
  const centreAt = side < 0 ? cx - 24 : cx + 24;
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
            <rect x={x} y={y - NODE_H / 2} width={width} height={NODE_H} rx={pure ? 5 : NODE_H / 2} />
            <text x={x + 10} y={y + 3.5}>
              {cut(node.label)}
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

// The graph draws its curves once it is in view (an arrival of its own: each curve after the one before).
function useSeen() {
  const ref = useRef<SVGSVGElement>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (node === null || typeof IntersectionObserver === "undefined") {
      setSeen(true);
      return undefined;
    }
    const watch = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setSeen(true);
        watch.disconnect();
      }
    });
    watch.observe(node);
    return () => {
      watch.disconnect();
    };
  }, []);
  return { ref, seen };
}

/** A minigraph of a place and what is linked to it: the centre, up to 7 dots on its left and 7 on its right joined by curves, a legend
 * with each side's total and a foot that names the dot picked. Each dot is a button when something answers a pick. Positions are
 * computed from the order, so the same links draw the same graph. */
export function Network({ label, centre, left, right, selected, onSelect, pickedHint }: NetworkProps) {
  const { ref, seen } = useSeen();
  const lanes = [left.nodes.slice(0, LANE_MAX), right.nodes.slice(0, LANE_MAX)] as const;
  const height = Math.max(150, Math.max(lanes[0].length, lanes[1].length) * GAP + 24);
  const width = Math.min(120, Math.floor((WIDTH - 96) / 2));
  const cx = WIDTH / 2;
  const cy = height / 2;
  const picked = [...lanes[0], ...lanes[1]].find((node) => node.id === selected);
  return (
    <Stack space="2xs">
      <svg
        ref={ref}
        className={styles["net"]}
        data-seen={seen ? "" : undefined}
        viewBox={`0 0 ${String(WIDTH)} ${String(height)}`}
        role="group"
        aria-label={label}
      >
        <circle className={styles["halo"]} cx={cx} cy={cy} r={36} />
        <Lane nodes={lanes[0]} side={-1} height={height} width={width} selected={selected} onSelect={onSelect} />
        <Lane nodes={lanes[1]} side={1} height={height} width={width} selected={selected} onSelect={onSelect} />
        <g className={styles["centre"]}>
          <circle cx={cx} cy={cy} r={24} />
          <text x={cx} y={cy + 4} textAnchor="middle">
            {centre.label.length > 6 ? `${centre.label.slice(0, 5)}…` : centre.label}
          </text>
        </g>
        {lanes[0].length === 0 ? (
          <text className={styles["none"]} x={cx - 40} y={cy + 3} textAnchor="end">
            {left.word} nothing
          </text>
        ) : null}
        {lanes[1].length === 0 ? (
          <text className={styles["none"]} x={cx + 40} y={cy + 3}>
            no {right.word} yet
          </text>
        ) : null}
      </svg>
      <p className={styles["legend"]}>
        <span>
          ← {left.word} <b>{left.total ?? left.nodes.length}</b>
        </span>
        <span>
          {right.word} <b>{right.total ?? right.nodes.length}</b> →
        </span>
      </p>
      <p className={styles["legend"]}>square = pure package, round = realm</p>
      <p className={styles["caption"]}>
        {picked === undefined
          ? "Select a node to read its path."
          : `${picked.detail ?? picked.label}${pickedHint === undefined ? "" : ` · ${pickedHint}`}`}
      </p>
    </Stack>
  );
}
