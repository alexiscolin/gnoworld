// The browser's client of the verdicts' stream (server/src/stream/stream.ts, mounted at /api/stream): the server's
// "checked" or "hidden" for each line of the rooms it follows, which a link's player waits on (slice 4's 4g). The
// browser's EventSource reconnects by itself and sends the last id, so the server replays what was missed. An event
// of a shape or state this page does not know is dropped, said once (F675, slice 4's plan §1).
import { StreamEvent } from "@gnoworld/schemas";

/** What the page's EventSource offers, so a test hands its own. */
export interface VerdictSource {
  addEventListener: (type: "verdict", listener: (event: { data: unknown }) => void) => void;
  close: () => void;
}

export interface VerdictOptions {
  open: (url: string) => VerdictSource;
  log: (what: "verdict_unknown") => void;
}

// A verdict's data, read: JSON of a known shape, or none.
function verdictOf(data: unknown): StreamEvent | undefined {
  if (typeof data !== "string") return undefined;
  try {
    const parsed = StreamEvent.safeParse(JSON.parse(data));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

/** Follows the rooms' verdicts, handing each on; stops when called. */
export function followVerdicts(
  rooms: readonly string[],
  onVerdict: (event: StreamEvent) => void,
  { open, log }: VerdictOptions,
): () => void {
  if (rooms.length === 0) return () => undefined;
  const source = open(`/api/stream?rooms=${encodeURIComponent(rooms.join(","))}`);
  let told = false;
  source.addEventListener("verdict", ({ data }) => {
    const event = verdictOf(data);
    if (event !== undefined) onVerdict(event);
    else if (!told) {
      told = true;
      log("verdict_unknown");
    }
  });
  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    source.close();
  };
}

/** The page's own stream, on its EventSource; an unknown verdict reported once, as the page reports an error. */
export const pageVerdicts = (rooms: readonly string[], onVerdict: (event: StreamEvent) => void) =>
  followVerdicts(rooms, onVerdict, {
    open: (url) => new EventSource(url),
    log: (what) => {
      reportError(new Error(`verdicts: ${what}`));
    },
  });
