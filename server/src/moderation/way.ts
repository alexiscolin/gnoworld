// A line's way once heard (slice 3's plan, 3h to 3k), as the chat runs it through its fair queue: checked, acted on,
// streamed and struck toward a mute, or kept among its room's recent lines (10g), then settled in its room's mark.
import type { DatabaseSync } from "node:sqlite";
import type { Said } from "../irc/link.ts";
import type { Command } from "../irc/lines.ts";
import { stateOf, type Stream } from "../stream/stream.ts";
import { act } from "./act.ts";
import type { Progress } from "./catchup.ts";
import { checkAgain, type Verdict } from "./check.ts";

export interface Steps {
  db: DatabaseSync;
  check: (said: Said) => Promise<Verdict | "seen" | "busy">;
  send: (command: Command, params: readonly string[]) => boolean;
  stream: Stream;
  progress: Progress;
  strike: (said: Said) => void;
  // A line moderation let through (the door's recent lines, 10g).
  passed: (said: Said) => void;
}

/** A line's way once heard: checked, acted on, streamed and struck, then settled in its room's mark. */
export function moderate({ db, check, send, stream, progress, strike, passed }: Steps): (said: Said) => Promise<void> {
  return async (said) => {
    let done = true;
    try {
      const verdict = await check(said);
      if (verdict === "seen") return;
      // Another run checks it now and settles it: settled here, the mark would pass a line not yet done.
      if (verdict === "busy") {
        done = false;
        return;
      }
      // A hide the link could not send: checked again when the catch-up brings the line back.
      done = act(said, verdict, { send });
      if (!done) checkAgain(db, said.msgid);
      // An unchecked line has no event: its previews wait.
      else {
        const state = stateOf(verdict.action);
        if (state !== undefined) stream.publish({ msgid: said.msgid, room: said.room, state });
        if (verdict.action === "hide") strike(said);
        else if (verdict.action === "pass") passed(said);
      }
    } finally {
      if (done) progress.settled(said);
    }
  };
}
