import { useLayoutEffect, useState, type CSSProperties, type ReactNode } from "react";
import { clampWidth, COLUMNS, COMPACT_MAX, CONVERSATION_MIN, type Edge, type Widths } from "./resize.ts";
import { useCompact } from "./useCompact.ts";
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
  /** The header a band over the columns, out of their flow, under the page's own header, which the columns start below (the app's wide
   * full chat): only its controls take a click, so the columns under it keep theirs. */
  band?: boolean;
  /** Told whether the box the chat is given is `COMPACT_MAX` wide or less (true till it is measured): the worlds, the info panel and the handles
   * are not drawn then, and the app leaves their slots empty. One measure, here, for the layout and the app. */
  onCompact?: (compact: boolean) => void;
  /** Changes when the box is taken to another place (the dock to the full chat): its width is read again at once. */
  moved?: unknown;
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
export function ChatLayout({
  header,
  worlds,
  rooms,
  info,
  infoFirst,
  band,
  onCompact,
  moved,
  widths,
  onResize,
  children,
}: ChatLayoutProps) {
  const vars = widthVars(widths);
  // The root as state: the measure and the columns' room both read it once it is there.
  const [root, setRoot] = useState<HTMLDivElement | null>(null);
  const compact = useCompact(root, COMPACT_MAX, moved);
  useLayoutEffect(() => {
    onCompact?.(compact);
  }, [compact, onCompact]);
  const handle = (edge: Edge) => {
    if (onResize === undefined) return null;
    return (
      <Separator
        edge={edge}
        value={widths?.[edge] ?? COLUMNS[edge].start}
        onChange={(px) => {
          onResize(edge, clampWidth(edge, px, roomFor(root, edge)));
        }}
        onReset={() => {
          onResize(edge, clampWidth(edge, COLUMNS[edge].start, roomFor(root, edge)));
        }}
      />
    );
  };
  return (
    <div ref={setRoot} className={styles["root"]} style={vars}>
      <div
        className={styles["frame"]}
        data-chat-layout=""
        role="region"
        aria-label="Chat"
        data-info-first={infoFirst === true ? "" : undefined}
        data-band={band === true ? "" : undefined}
        data-compact={compact ? "" : undefined}
      >
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
