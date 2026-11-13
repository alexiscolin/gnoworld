import { useRef, type KeyboardEvent, type PointerEvent } from "react";
import { COLUMNS, type Edge } from "./resize.ts";
import styles from "./ChatLayout.module.css";

const STEP = 16;

export interface SeparatorProps {
  edge: Edge;
  /** The column's width now, in px. */
  value: number;
  /** The width asked for, which the layout holds to its bounds. */
  onChange: (px: number) => void;
  onReset: () => void;
}

/** The drag handle on a column's border: the rooms' right edge, the info panel's left. A pointer drags it, the arrows step it,
 * Home and End go to the bounds, a double click puts the default back. */
export function Separator({ edge, value, onChange, onReset }: SeparatorProps) {
  const { min, max } = COLUMNS[edge];
  // The pointer's start and the width then; none while no drag is on.
  const dragRef = useRef<{ x: number; width: number }>(undefined);
  // The info panel grows leftwards: its sign is the other way.
  const sign = edge === "rooms" ? 1 : -1;
  const onKeyDown = (event: KeyboardEvent) => {
    const to: Record<string, number> = {
      ArrowRight: value + sign * STEP,
      ArrowLeft: value - sign * STEP,
      Home: min,
      End: max,
    };
    const next = to[event.key];
    if (next === undefined) return;
    event.preventDefault();
    onChange(next);
  };
  const onPointerMove = (event: PointerEvent) => {
    if (dragRef.current !== undefined) onChange(dragRef.current.width + sign * (event.clientX - dragRef.current.x));
  };
  return (
    <div className={styles["handle"]}>
      <div
        className={styles["separator"]}
        role="separator"
        aria-orientation="vertical"
        aria-label={edge === "rooms" ? "Resize the rooms column" : "Resize the info panel"}
        aria-valuenow={value}
        aria-valuemin={min}
        aria-valuemax={max}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onDoubleClick={onReset}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          dragRef.current = { x: event.clientX, width: value };
        }}
        onPointerMove={onPointerMove}
        onPointerUp={() => {
          dragRef.current = undefined;
        }}
        onPointerCancel={() => {
          dragRef.current = undefined;
        }}
      />
    </div>
  );
}
