// What the bubbles' pick takes and gives (docs/plans/slice-6.md §7).
import type { LatLon } from "./farSide.ts";
import type { Rules } from "./rules.ts";

export interface BubbleMessage {
  readonly id: string;
  /** When it was said, in milliseconds. */
  readonly at: number;
  /** The speaker's account: the delay is keyed by it, never by a display name. */
  readonly account: string;
  readonly text: string;
  /** The speaker's declared country (two capitals), or none: it is never guessed. */
  readonly country?: string;
  readonly visibility: "public" | "private" | "dm";
  readonly joined: boolean;
  readonly hub?: string;
  readonly mentions?: readonly string[];
  /** Hidden by the moderation bot. */
  readonly hidden?: boolean;
}

export interface Viewer {
  readonly account: string;
  readonly hub?: string;
  readonly muted: readonly string[];
  readonly banned: readonly string[];
  /** The centre of the globe's view; none means no far side. */
  readonly facing?: LatLon;
}

export interface Bubble {
  readonly id: string;
  readonly account: string;
  readonly country: string;
  readonly text: string;
  readonly since: number;
  readonly until: number;
  readonly own: boolean;
}

export interface Count {
  readonly country: string;
  readonly count: number;
  readonly far: boolean;
}

export interface Picked {
  /** On screen now, those already there first. */
  readonly bubbles: readonly Bubble[];
  /** The messages of each country that got no bubble, the largest first. */
  readonly counts: readonly Count[];
  /** The state to give back next time: every bubble on screen or inside its speaker's delay. */
  readonly shown: readonly Bubble[];
}

/** The five arguments, named; one rest parameter keeps the lint's three-parameter limit. */
export type PickArgs = readonly [
  messages: readonly BubbleMessage[],
  now: number,
  viewer: Viewer,
  rules: Rules,
  shown: readonly Bubble[],
];
