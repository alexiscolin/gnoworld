// The rules of the Earth's bubbles (ADR-0001 §7). The numbers live in app/data/bubbles.json, checked by BubbleRules
// (packages/schemas) when the app builds; nothing here holds one.
export interface Rules {
  /** The most bubbles on screen at once. */
  readonly maxOnScreen: number;
  /** How long a bubble shows, in seconds. */
  readonly showSeconds: number;
  /** The time a speaker waits between two bubbles, in seconds. */
  readonly speakerDelaySeconds: number;
  /** The most graphemes of a bubble's text. */
  readonly maxChars: number;
  /** How many of the newest messages are read. */
  readonly readLast: number;
  /** How old a message may be to be picked or counted, in seconds; an older one is not a bubble, whatever is listed. */
  readonly maxAgeSeconds: number;
}
