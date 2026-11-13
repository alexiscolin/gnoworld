// The reader's answer for a URL (docs/plans/link-previews.md §3 step 3): the page's head through the guarded fetch, its picture through
// the same guard, one `ReaderCard`. A picture that fails gives a card with none; a page with no title, a refused URL or a failed page
// gives a `Refused`.
import { ReaderCard } from "@gnoworld/schemas";
import { fetchLimited, Refused } from "./fetch.ts";
import type { Deps, Kind } from "./fetch.ts";
import { decodeHtml, parseHead } from "./head.ts";
import { reencode, wasmCodecs } from "./picture.ts";
import type { Codecs, Fault } from "./picture.ts";

/** The most a card takes, page and picture together: the server's client gives up at 8 s. */
export const CARD_MS = 7000;

export interface CardDeps extends Deps {
  /** Runs a picture's work alone, one at a time (the container's memory holds one decode, not two). */
  hold?: <T>(job: () => Promise<T>) => Promise<T>;
  /** One line when a picture is left out: the kind of its fetch's refusal or of its fault, never the URL. */
  log?: ((entry: { picture: Kind | Fault | "crash" }) => void) | undefined;
}

export async function readCard(url: string, deps: CardDeps, codecs: Codecs = wasmCodecs): Promise<ReaderCard> {
  const late = new AbortController();
  const timer = setTimeout(() => {
    late.abort();
  }, CARD_MS);
  const stop = deps.signal === undefined ? late.signal : AbortSignal.any([deps.signal, late.signal]);
  try {
    const page = await fetchLimited(url, "page", { ...deps, signal: stop });
    const head = parseHead(decodeHtml(page.bytes, page.type), page.url);
    if (head === undefined) throw new Refused("empty");
    const picture = head.image === undefined ? null : await pictureOf(head.image, { deps, codecs, stop });
    return ReaderCard.parse({ title: head.title, description: head.description, site: head.site, picture });
  } finally {
    clearTimeout(timer);
  }
}

// The picture through the same guard, decoded in its turn if the card's time is not up; null, logged, when it fails.
async function pictureOf(
  image: string,
  { deps, codecs, stop }: { deps: CardDeps; codecs: Codecs; stop: AbortSignal },
): Promise<ReaderCard["picture"]> {
  const failed = (picture: Kind | Fault | "crash") => deps.log?.({ picture });
  const hold = deps.hold ?? ((job) => job());
  const fetched = await fetchLimited(image, "picture", { ...deps, signal: stop }).catch((error: unknown) => {
    failed(error instanceof Refused ? error.kind : "crash");
    return undefined;
  });
  if (fetched === undefined) return null;
  return hold(async () => (stop.aborted ? (failed("timeout"), null) : reencode(fetched.bytes, codecs, failed)));
}
