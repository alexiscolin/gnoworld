// The browser's client of the verdicts' stream (server/src/stream/stream.ts, mounted at /api/stream): the server's
// "checked" or "hidden" for each line of the rooms it follows, which a link's player waits on (slice 4's 4g). The
// browser's EventSource reconnects by itself and sends the last id, so the server replays what was missed. An event
// of a shape or state this page does not know is dropped, said once (F675, slice 4's plan §1). After its replay, the
// stream says when it began following, on the server's clock (F890). An answer not 200 (a 429, a restart's 502)
// ends it for good, which the page is told (F888).
import { Signal, StreamEvent, StreamSince } from "@gnoworld/schemas";
import type { Language } from "../language.ts";
import { read } from "./read.ts";

/** What the page's EventSource offers, so a test hands its own. */
export interface VerdictSource {
  addEventListener: (
    type: "verdict" | "since" | "signal" | "chain" | "realms" | "card" | "translation" | "error",
    listener: (event: { data: unknown }) => void,
  ) => void;
  close: () => void;
  /** EventSource's: 2, CLOSED, once it gives up; it reconnects by itself from any other. */
  readonly readyState: number;
}

const CLOSED = 2;

/** The rest after a 429, the route's minute (server/src/stream/verdicts.ts), before a stream is asked for again. */
export const BUSY_REST_MS = 60_000;

export interface VerdictOptions {
  open: (url: string) => VerdictSource;
  log: (what: "verdict_unknown" | "since_unknown" | "signal_unknown") => void;
  /** A first signal of a world the rooms belong to (slice 9h). */
  signal?: ((signal: Signal) => void) | undefined;
  /** The data of a `chain` event (slice 9g), unread: its schema is the feed's (chainFeed.ts), which a page loads on the first. */
  chain?: ((data: unknown) => void) | undefined;
  /** The data of a `card` event (link-previews L4), unread too: its schema is the cards' feed's, a chunk a page loads on the first. */
  card?: ((data: unknown) => void) | undefined;
  /** The data of a `translation` event, unread too: its schema is the translations' feed's. */
  translation?: ((data: unknown) => void) | undefined;
  /** The language the signed-in reader reads the translations in: the stream tells those and no other, and counts it in the world's languages. */
  language?: Language | undefined;
  /** The stream's word of when it began following, in ms. */
  since?: (time: number) => void;
  /** The stream ended for good: the browser will not reconnect it. */
  dead?: () => void;
}

/** Follows the rooms' verdicts, handing each on; stops when called. */
export function followVerdicts(
  rooms: readonly string[],
  onVerdict: (event: StreamEvent) => void,
  { open, log, signal, chain, card, translation, language, since, dead }: VerdictOptions,
): () => void {
  if (rooms.length === 0) return () => undefined;
  const asked = language === undefined ? "" : `&language=${language}`;
  const source = open(`/api/stream?rooms=${encodeURIComponent(rooms.join(","))}${asked}`);
  const told = new Set<string>();
  const once = (what: "verdict_unknown" | "since_unknown" | "signal_unknown") => {
    if (told.has(what)) return;
    told.add(what);
    log(what);
  };
  source.addEventListener("verdict", ({ data }) => {
    const event = read(data, StreamEvent);
    if (event !== undefined) onVerdict(event);
    else once("verdict_unknown");
  });
  if (signal !== undefined)
    source.addEventListener("signal", ({ data }) => {
      const event = read(data, Signal);
      if (event !== undefined) signal(event);
      else once("signal_unknown");
    });
  // The chain's events (9g) and the cards' (L4) go on unread: the feed that reads them is a chunk a page loads on the first.
  for (const [type, on] of [
    ["chain", chain],
    ["card", card],
    ["translation", translation],
  ] as const)
    if (on !== undefined)
      source.addEventListener(type, ({ data }) => {
        on(data);
      });
  source.addEventListener("since", ({ data }) => {
    const word = read(data, StreamSince);
    if (word === undefined) once("since_unknown");
    else since?.(Date.parse(word.time));
  });
  let stopped = false;
  let ended = false;
  source.addEventListener("error", () => {
    if (source.readyState !== CLOSED || stopped || ended) return;
    ended = true;
    dead?.();
  });
  return () => {
    if (stopped) return;
    stopped = true;
    source.close();
  };
}

/** The page's own stream, on its EventSource; an unknown event reported once, as the page reports an error. */
export const pageVerdicts = (
  rooms: readonly string[],
  on: Pick<VerdictOptions, "signal" | "chain" | "card" | "translation" | "language"> & {
    verdict: (event: StreamEvent) => void;
    since: (time: number) => void;
    dead: () => void;
  },
) =>
  followVerdicts(rooms, on.verdict, {
    open: (url) => new EventSource(url),
    signal: on.signal,
    chain: on.chain,
    card: on.card,
    translation: on.translation,
    language: on.language,
    log: (what) => {
      reportError(new Error(`verdicts: ${what}`));
    },
    since: on.since,
    dead: on.dead,
  });
