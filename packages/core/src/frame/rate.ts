// How fast the scene draws (ADR-0002 §9, rendering): the rate from what is happening, and a budget carried from one refresh to the
// next, so a 75 to 165 Hz screen keeps exactly those rates. Every value is a plain number: the loop calls these on each refresh, and
// allocates nothing there.

export type FrameRate = 0 | 10 | 15 | 30 | 60;

/** What the rate depends on, as the loop holds it. */
export interface LoopState {
  /** The tab is hidden. */
  readonly hidden: boolean;
  /** An opaque view covers the scene. */
  readonly covered: boolean;
  /** The window has the focus. */
  readonly focused: boolean;
  /** A flight, an interaction, or the Auto probe. */
  readonly busy: boolean;
  /** One frame is owed: the buffer was cleared or the view changed. */
  readonly owed: boolean;
  /** Reduced motion: the scenery does not move. */
  readonly still: boolean;
  /** Milliseconds since the last input. */
  readonly sinceInput: number;
}

const SETTLED_AFTER_MS = 20_000;
const IDLE_AFTER_MS = 60_000;
// How early a refresh may draw. It absorbs a refresh's jitter, and whatever it lends comes back out of the next budget.
const SLACK_MS = 8;

/** The frames a second the scene asks for: 0 when nothing need be drawn. */
export function frameRate(state: LoopState): FrameRate {
  if (state.hidden || state.covered) return 0;
  if (state.busy || state.owed) return 60;
  if (!state.focused || state.still) return 0;
  if (state.sinceInput >= IDLE_AFTER_MS) return 10;
  return state.sinceInput >= SETTLED_AFTER_MS ? 15 : 30;
}

/** Whether a refresh `elapsed` ms after the last one draws, with `carried` ms of budget held over. */
export function isDue(carried: number, elapsed: number, rate: FrameRate): boolean {
  return rate > 0 && carried + elapsed + SLACK_MS >= 1000 / rate;
}

/** The budget left once a due frame is drawn; half a frame at most, so a stall is not drawn back in a burst. */
export function carryOver(carried: number, elapsed: number, rate: FrameRate): number {
  if (rate === 0) return 0;
  const interval = 1000 / rate;
  return Math.min(carried + elapsed - interval, interval / 2);
}

/** How long to wait before asking for the frame after this one: less than one 60 Hz refresh before it is due. */
export function frameWait(carried: number, rate: FrameRate): number {
  return 1000 / rate - carried - SLACK_MS;
}
