// What the verdicts' stream tells a page (slice 3's plan, 3j): a message's id, its room and its state,
// never its text. Slice 4 adds the preview's own states (decision 158).
import { z } from "./zod.ts";

export const StreamEvent = z.strictObject({
  msgid: z.string().min(1).max(128),
  room: z.string().min(2).max(64),
  state: z.enum(["checked", "hidden"]),
});
export type StreamEvent = z.infer<typeof StreamEvent>;

/** The lines a page asks GET /api/verdicts about at most, one request's worth. */
export const VERDICTS_ASKED = 100;

/** GET /api/verdicts's answer (slice 4's 4g; docs/decisions.md, 2026-10-26): the latest verdict of each line asked
 * that holds one, for a history older than the stream's replay; a line unchecked, pending or unknown is absent. */
export const LineVerdicts = z.strictObject({
  room: StreamEvent.shape.room,
  verdicts: z
    .array(z.strictObject({ msgid: StreamEvent.shape.msgid, state: StreamEvent.shape.state }))
    .max(VERDICTS_ASKED),
});
export type LineVerdicts = z.infer<typeof LineVerdicts>;
