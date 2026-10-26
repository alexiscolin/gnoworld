// The server's verdicts of a room's lines in view (slice 4's 4g; docs/decisions.md, 2026-10-26): GET /api/verdicts
// for the lines said before the page began following the room's stream, which the stream gives from then on (F884);
// asked once each while in view, VERDICTS_ASKED a request; a line whose request failed in a way that may pass is
// asked again.
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

/** A room's lines in view, the verdicts the page holds of them, and when it began following the room's stream. */
export interface InView {
  lines: readonly Line[];
  held: Readonly<Record<string, unknown>> | undefined;
  /** The time the page's stream of the room opened, in ms: a line said from then on has its verdict from it. */
  since: number;
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
    ask: (room: string, { lines, held, since }: InView): void => {
      const mine = asked.get(room) ?? new Set<string>();
      asked.set(room, mine);
      // What was asked of a line gone from view is forgotten, so a long session holds no more than its view.
      const shown = new Set(lines.map(({ id }) => id));
      for (const id of mine) if (!shown.has(id)) mine.delete(id);
      const before = lines.filter(({ time }) => Date.parse(time) < since);
      const wanted = unjudged(before, held, mine);
      for (const id of wanted) mine.add(id);
      for (let start = 0; start < wanted.length; start += VERDICTS_ASKED) {
        ask(room, wanted.slice(start, start + VERDICTS_ASKED), mine);
      }
    },
  };
}
