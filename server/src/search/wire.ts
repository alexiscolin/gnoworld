import type { Log } from "@gnoworld/service/log";
import type { RecentLines } from "../door/lines.ts";
import type { Fetched, Link, Said } from "../irc/link.ts";
import { guarded } from "./guard.ts";
import type { Search } from "./index.ts";

interface Parts {
  recent: Pick<RecentLines, "passed" | "taken">;
  link: () => Link | undefined;
}

/** What the chat does with the index: the recent lines' two entries now also feed it, and the link's join asks Ergo again. Each
 * step is guarded, so a failing index (a full disk, a locked file) is logged and never stops a line reaching the stream (T8). */
export function indexing(search: Search | undefined, log: Log, { recent, link }: Parts) {
  const guard = guarded(log);
  const safe = (step: string, work: (search: Search) => void): void => {
    if (search !== undefined)
      guard(
        step,
        () => {
          work(search);
        },
        undefined,
      );
  };
  const fetch = (room: string, msgid: string): Promise<Fetched> =>
    link()?.line(room, msgid) ?? Promise.resolve("unanswered");
  // The joins' reconciles one after the other: each asks the link a question a line, and the link holds 1,000 at once (F13702).
  let asking = Promise.resolve();
  return {
    /** The one entry of every line the bot passed, a guest's relayed one too (F13700), and the REDACT's. */
    recent: {
      passed: (said: Said): void => {
        recent.passed(said);
        safe("add", (index) => {
          if (said.edits === undefined) index.add(said);
          else index.edited(said);
        });
      },
      taken: (room: string, msgid: string): void => {
        recent.taken(room, msgid);
        safe("remove", (index) => {
          index.remove(room, msgid);
        });
      },
    },
    /** The pins' hooks, and on the link's join the room's lines asked of Ergo again, for a delete heard while it was down (Q6). */
    kept: <K extends { hooks: { onIn: (room: string) => void } }>(kept: K): K => ({
      ...kept,
      hooks: {
        ...kept.hooks,
        onIn: (room: string): void => {
          kept.hooks.onIn(room);
          if (search === undefined) return;
          asking = asking
            .then(() => search.reconcile(room, fetch))
            .catch((error: unknown) => {
              log("search_unreconciled", { room, error: error instanceof Error ? error.name : "unknown" });
            });
        },
      },
    }),
  };
}
