/** The two columns the reader may drag, in px: where each stands by default and the bounds it keeps (Alexis, 2026-11-07). */
export const COLUMNS = {
  rooms: { start: 232, min: 180, max: 360 },
  info: { start: 360, min: 280, max: 520 },
} as const;
export type Edge = keyof typeof COLUMNS;
export type Widths = Record<Edge, number>;

/** The conversation never goes under this width, whatever a column is dragged to. */
export const CONVERSATION_MIN = 360;

/** A width held between the column's bounds, `room` being the most the box leaves it; the minimum wins where the box is too narrow. */
export function clampWidth(edge: Edge, value: number, room: number): number {
  const { min, max } = COLUMNS[edge];
  return Math.round(Math.max(min, Math.min(value, max, room)));
}

/** The chat's own width, in px, at which it is a phone's layout: the conversation alone, the rooms behind a control (docs/DESIGN-SYSTEM.md). */
export const COMPACT_MAX = 900;
