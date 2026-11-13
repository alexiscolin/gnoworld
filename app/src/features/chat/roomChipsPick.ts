// Which of a world's rooms the dock's one-line chip row shows, and how many of them its width holds.
import type { RoomList } from "@gnoworld/schemas";

type Listed = RoomList["sections"][number]["rooms"][number];

// The Earth lists a thousand rooms: the row measures this many, never every one.
const CANDIDATES = 40;

/**
 * The rooms in the order they give way, the last first: the one in view, those holding unseen lines (most first), then the most active
 * (the lines each had in 24 hours the list carries, then the people in it), the list's own order breaking a tie.
 */
export function pickRooms(
  rooms: readonly Pick<Listed, "room" | "here" | "messages">[],
  current: string | undefined,
  badges: Readonly<Record<string, number>> | undefined,
): string[] {
  const unseen = (room: string) => Math.max(badges?.[room] ?? 0, 0);
  const rank = (a: (typeof rooms)[number], b: (typeof rooms)[number]) =>
    Number(b.room === current) - Number(a.room === current) ||
    unseen(b.room) - unseen(a.room) ||
    (b.messages ?? 0) - (a.messages ?? 0) ||
    (b.here ?? 0) - (a.here ?? 0);
  return rooms
    .toSorted(rank)
    .map(({ room }) => room)
    .slice(0, CANDIDATES);
}

/**
 * How many chips (their `widths`, px, in order) a row of `room` px holds a `gap` apart: all of them, else the "+N" chip (`more`, px) takes
 * the end. The first, the room in view, always stays.
 */
export function chipsFit(
  widths: readonly number[],
  { room, gap, more }: { room: number; gap: number; more: number },
): number {
  const total = widths.length;
  let used = 0;
  let count = 0;
  for (const [index, width] of widths.entries()) {
    used += width + (index > 0 ? gap : 0);
    const left = total - index - 1;
    if (used + (left > 0 ? gap + more : 0) > room) break;
    count = index + 1;
  }
  return Math.max(1, Math.min(count, total));
}
