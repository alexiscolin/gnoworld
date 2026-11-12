// A bubble's words as the line reads, its Markdown marks gone (a link's words kept): in a chunk of its own, asked when the first bubble
// shows, since reading Markdown is never the first screen's (ADR-0001 §12). The words are read first, then cut to `max` graphemes with
// an ellipsis (core's excerpt), so a mark is never cut in half and no star is left.
import { excerpt } from "@gnoworld/core";

export function BubbleWords({ text, max }: { text: string; max: number }) {
  return excerpt(text, max);
}
