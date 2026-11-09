import { useRef, type CSSProperties, type ReactNode } from "react";
import { clampWidth, COLUMNS, CONVERSATION_MIN, type Edge, type Widths } from "./resize.ts";
import { Separator } from "./Separator.tsx";
import styles from "./ChatLayout.module.css";

export interface ChatLayoutProps {
  /** Across the top: the place, the room's name and the controls. */
  header: ReactNode;
  /** The column of worlds, at the left edge; none draws no column. */
  worlds?: ReactNode;
  /** The room sidebar; none draws none (a phone keeps it behind a control). */
  rooms?: ReactNode;
  /** The panel at the right edge; none draws none. */
  info?: ReactNode;
  /** The panel takes the conversation's place where the screen is narrow, as a thread's does. */
  infoFirst?: boolean;
  /** The widths of the rooms and the info columns this device keeps, in px; none leaves the tokens' and draws no handle. */
  widths?: Partial<Widths>;
  /** A column was dragged or stepped to a width, already held to its bounds and to the conversation's minimum; the default is `COLUMNS`'. */
  onResize?: (edge: Edge, px: number) => void;
  children: ReactNode;
}

type Vars = CSSProperties & Record<`--${string}`, string>;

// Set on the root, so the header's place reads the same widths as the columns; a column not dragged keeps the token's.
function widthVars(widths: Partial<Widths> | undefined): Vars {
  const vars: Vars = {};
  if (widths?.rooms !== undefined) vars["--chat-rooms"] = `${String(widths.rooms)}px`;
  if (widths?.info !== undefined) vars["--chat-info"] = `${String(widths.info)}px`;
  return vars;
}

// What the box leaves a column: its width less the other regions' and the conversation's minimum.
function roomFor(box: HTMLElement | null, edge: Edge): number {
  if (box === null) return Infinity;
  const others = [
    ...box.querySelectorAll<HTMLElement>("[data-region='worlds'], [data-region='rooms'], [data-region='info']"),
  ]
    .filter((region) => region.dataset["region"] !== edge)
    .reduce((sum, region) => sum + region.offsetWidth, 0);
  return box.clientWidth - others - CONVERSATION_MIN;
}

/** The full-screen chat's frame (the video's frame 23.58.01): a header across, then the worlds, the rooms, the
 * conversation and the info panel, each a region that holds its own scroll. It places; the app fills the slots, and the conversation's own list scrolls
 * inside it, over a composer that stays. */
export function ChatLayout({ header, worlds, rooms, info, infoFirst, widths, onResize, children }: ChatLayoutProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const vars = widthVars(widths);
  const handle = (edge: Edge) => {
    if (onResize === undefined) return null;
    return (
      <Separator
        edge={edge}
        value={widths?.[edge] ?? COLUMNS[edge].start}
        onChange={(px) => {
          onResize(edge, clampWidth(edge, px, roomFor(rootRef.current, edge)));
        }}
        onReset={() => {
          onResize(edge, clampWidth(edge, COLUMNS[edge].start, roomFor(rootRef.current, edge)));
        }}
      />
    );
  };
  return (
    <div ref={rootRef} className={styles["root"]} style={vars}>
      <div className={styles["frame"]} data-chat-layout="" data-info-first={infoFirst === true ? "" : undefined}>
        <div className={styles["header"]} data-region="header">
          {header}
        </div>
        <div className={styles["body"]}>
          {worlds === undefined ? null : (
            <div className={styles["worlds"]} data-region="worlds">
              {worlds}
            </div>
          )}
          {rooms === undefined ? null : (
            <div className={styles["rooms"]} data-region="rooms">
              {rooms}
            </div>
          )}
          {rooms === undefined ? null : handle("rooms")}
          <div className={styles["conversation"]} data-region="conversation">
            {children}
          </div>
          {info === undefined ? null : handle("info")}
          {info === undefined ? null : (
            <div className={styles["info"]} data-region="info">
              {info}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
