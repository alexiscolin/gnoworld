// The browser's client of the verdicts' stream (server/src/stream/stream.ts, mounted at /api/stream): the server's
// "checked" or "hidden" for each line of the rooms it follows, which a link's player waits on (slice 4's 4g). The
// browser's EventSource reconnects by itself and sends the last id, so the server replays what was missed. An event
// of a shape or state this page does not know is dropped, said once (F675, slice 4's plan §1). After its replay, the
// stream says when it began following, on the server's clock (F890).
import { StreamEvent, StreamSince } from "@gnoworld/schemas";

/** What the page's EventSource offers, so a test hands its own. */
export interface VerdictSource {
  addEventListener: (type: "verdict" | "since", listener: (event: { data: unknown }) => void) => void;
  close: () => void;
}

export interface VerdictOptions {
  open: (url: string) => VerdictSource;
  log: (what: "verdict_unknown" | "since_unknown") => void;
  /** The stream's word of when it began following, in ms. */
  since?: (time: number) => void;
}

// An event's data, read: JSON of the schema's shape, or none.
function read<T>(
  data: unknown,
  schema: { safeParse: (value: unknown) => { success: true; data: T } | { success: false } },
): T | undefined {
  if (typeof data !== "string") return undefined;
  try {
    const parsed = schema.safeParse(JSON.parse(data));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

/** Follows the rooms' verdicts, handing each on; stops when called. */
export function followVerdicts(
  rooms: readonly string[],
  onVerdict: (event: StreamEvent) => void,
  { open, log, since }: VerdictOptions,
): () => void {
  if (rooms.length === 0) return () => undefined;
  const source = open(`/api/stream?rooms=${encodeURIComponent(rooms.join(","))}`);
  const told = new Set<string>();
  const once = (what: "verdict_unknown" | "since_unknown") => {
    if (told.has(what)) return;
    told.add(what);
    log(what);
  };
  source.addEventListener("verdict", ({ data }) => {
    const event = read(data, StreamEvent);
    if (event !== undefined) onVerdict(event);
    else once("verdict_unknown");
  });
  source.addEventListener("since", ({ data }) => {
    const word = read(data, StreamSince);
    if (word === undefined) once("since_unknown");
    else since?.(Date.parse(word.time));
  });
  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    source.close();
  };
}

/** The page's own stream, on its EventSource; an unknown event reported once, as the page reports an error. */
export const pageVerdicts = (
  rooms: readonly string[],
  on: { verdict: (event: StreamEvent) => void; since: (time: number) => void },
) =>
  followVerdicts(rooms, on.verdict, {
    open: (url) => new EventSource(url),
    log: (what) => {
      reportError(new Error(`verdicts: ${what}`));
    },
    since: on.since,
  });
