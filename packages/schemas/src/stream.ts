// What the verdicts' stream tells a page (slice 3's plan, 3j): a message's id, its room and its state,
// never its text. Slice 4 adds the preview's own states (decision 158).
import { z } from "zod";

export const StreamEvent = z.strictObject({
  msgid: z.string().min(1).max(128),
  room: z.string().min(2).max(64),
  state: z.enum(["checked", "hidden"]),
});
export type StreamEvent = z.infer<typeof StreamEvent>;
