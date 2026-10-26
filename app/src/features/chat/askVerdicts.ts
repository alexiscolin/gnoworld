// The verdicts of the shown room's lines (slice 4's 4g; docs/decisions.md, 2026-10-26): the room's stream, which the
// asker follows, gives them from its opening on; GET /api/verdicts the lines said before (F884), asked once each while
// in view, VERDICTS_ASKED a request. After a failure that may pass, nothing is asked for a rest, then the view last
// given is asked again (F874).
import type { Line } from "@gnoworld/core";
import { type LineVerdicts, type StreamEvent, VERDICTS_ASKED } from "@gnoworld/schemas";
import type { Result } from "../../lib/api/http.ts";
import { unjudged } from "./embeds.ts";

export interface Asking {
  /** The server's verdicts of these lines of a room (lib/api/verdicts.ts). */
  verdicts: (room: string, ids: readonly string[]) => Promise<Result<LineVerdicts>>;
  /** A verdict the stream or the server gave, into the store. */
  judged: (event: StreamEvent) => void;
  /** The verdicts the page holds of a room's lines. */
  held: (room: string) => Readonly<Record<string, unknown>> | undefined;
  /** Follows a room's stream (lib/stream/verdicts.ts), handing on its verdicts; stops when called. */
  follow: (room: string, on: { verdict: (event: StreamEvent) => void }) => () => void;
  /** The page's clock, in ms. */
  now: () => number;
}

// A room's lines in view, the verdicts the page holds of them, and when it began following the room's stream.
interface InView {
  lines: readonly Line[];
  held: Readonly<Record<string, unknown>> | undefined;
  /** The time the page's stream of the room opened, in ms: a line said from then on has its verdict from it. */
  since: number;
}

/** The rest after a failure that may pass; after "too many", the route's minute (server/src/stream/verdicts.ts). */
export const REST_MS = 10_000;
export const BUSY_REST_MS = 60_000;
// The failures that may pass: the others (refused, forbidden, malformed) the server would give again.
const PASSING: ReadonlySet<string> = new Set(["network", "unavailable", "internal", "not_ready", "too_many"]);

export function verdictAsker({ verdicts, judged, held, follow, now }: Asking) {
  const asked = new Map<string, Set<string>>();
  // The room whose stream the asker follows, when it began, and how to stop it.
  let following: { room: string; since: number; stop: () => void } | undefined;
  // The view last given, asked again when a rest ends; the rest under way, during which nothing is asked.
  let latest: { room: string; view: InView } | undefined;
  let resting: ReturnType<typeof setTimeout> | undefined;
  const rest = (ms: number) => {
    // One rest at a time: a request failing later in it would otherwise ask again in the middle of the next one.
    if (resting !== undefined) return;
    resting = setTimeout(() => {
      resting = undefined;
      if (latest !== undefined) ask(latest.room, latest.view);
    }, ms);
  };
  const send = (room: string, ids: readonly string[], mine: Set<string>) => {
    const failed = (ms: number) => {
      for (const id of ids) mine.delete(id);
      rest(ms);
    };
    verdicts(room, ids).then(
      (got) => {
        if (got.ok) {
          for (const { msgid, state } of got.value.verdicts) judged({ msgid, room, state });
        } else if (PASSING.has(got.reason)) failed(got.reason === "too_many" ? BUSY_REST_MS : REST_MS);
      },
      () => {
        failed(REST_MS);
      },
    );
  };
  // Asks the verdicts of the room's lines in view that the page neither holds nor has asked for.
  const ask = (room: string, view: InView): void => {
    latest = { room, view };
    if (resting !== undefined) return;
    const { lines, since } = view;
    const mine = asked.get(room) ?? new Set<string>();
    asked.set(room, mine);
    // What was asked of a line gone from view is forgotten, so a long session holds no more than its view.
    const shown = new Set(lines.map(({ id }) => id));
    for (const id of mine) if (!shown.has(id)) mine.delete(id);
    const before = lines.filter(({ time }) => Date.parse(time) < since);
    const wanted = unjudged(before, view.held, mine);
    for (const id of wanted) mine.add(id);
    for (let start = 0; start < wanted.length; start += VERDICTS_ASKED) {
      send(room, wanted.slice(start, start + VERDICTS_ASKED), mine);
    }
  };
  const unfollow = () => {
    following?.stop();
    following = undefined;
  };
  return {
    /** Follows the room's stream, the room shown before stopped; then asks of its lines in view, once loaded. */
    show: (room: string | undefined, lines: readonly Line[] | undefined): void => {
      if (following?.room !== room) {
        unfollow();
        if (room !== undefined) following = { room, since: now(), stop: follow(room, { verdict: judged }) };
      }
      if (following === undefined || lines === undefined) return;
      ask(following.room, { lines, held: held(following.room), since: following.since });
    },
    /** Follows and asks nothing more: a rest under way, or one an answer still to come starts, ends with nothing
     * asked. */
    stop: (): void => {
      latest = undefined;
      unfollow();
    },
  };
}
