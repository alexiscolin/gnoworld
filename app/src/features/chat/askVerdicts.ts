// The server's verdicts of a room's lines in view (slice 4's 4g; docs/decisions.md, 2026-10-26): GET /api/verdicts
// for the lines the stream did not give, a line older than its replay among them, asked once each, VERDICTS_ASKED a
// request; a line whose request failed in a way that may pass is asked again.
import type { Line } from "@gnoworld/core";
import { type LineVerdicts, type StreamEvent, VERDICTS_ASKED } from "@gnoworld/schemas";
import type { Result } from "../../lib/api/http.ts";
import { unjudged } from "./embeds.ts";

export interface Asking {
  /** The server's verdicts of these lines of a room (lib/api/verdicts.ts). */
  verdicts: (room: string, ids: readonly string[]) => Promise<Result<LineVerdicts>>;
  /** A verdict the server gave, into the store. */
  judged: (event: StreamEvent) => void;
}

/** A room's lines in view, and the verdicts the page holds of them. */
export interface InView {
  lines: readonly Line[];
  held: Readonly<Record<string, unknown>> | undefined;
}

export function verdictAsker({ verdicts, judged }: Asking) {
  const asked = new Map<string, Set<string>>();
  const ask = (room: string, ids: readonly string[], mine: Set<string>) => {
    const again = () => {
      for (const id of ids) mine.delete(id);
    };
    verdicts(room, ids).then((got) => {
      if (got.ok) {
        for (const { msgid, state } of got.value.verdicts) judged({ msgid, room, state });
      } else if (got.reason === "network" || got.reason === "unavailable") again();
    }, again);
  };
  return {
    /** Asks the verdicts of the room's lines in view that the page neither holds nor has asked for. */
    ask: (room: string, { lines, held }: InView): void => {
      const mine = asked.get(room) ?? new Set<string>();
      asked.set(room, mine);
      const wanted = unjudged(lines, held, mine);
      for (const id of wanted) mine.add(id);
      for (let start = 0; start < wanted.length; start += VERDICTS_ASKED) {
        ask(room, wanted.slice(start, start + VERDICTS_ASKED), mine);
      }
    },
  };
}
