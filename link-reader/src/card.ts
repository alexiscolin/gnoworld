// The reader's answer for a URL (docs/plans/link-previews.md §3 step 3): the page's head through the guarded fetch, its picture through
// the same guard, one `ReaderCard`. A picture that fails gives a card with none; a page with no title, a refused URL or a failed page
// gives a `Refused`.
import { ReaderCard } from "@gnoworld/schemas";
import { fetchLimited, Refused } from "./fetch.ts";
import type { Deps } from "./fetch.ts";
import { decodeHtml, parseHead } from "./head.ts";
import { reencode, wasmCodecs } from "./picture.ts";
import type { Codecs } from "./picture.ts";

export interface CardDeps extends Deps {
  /** Runs a picture's work alone, one at a time (the container's memory holds one decode, not two). */
  hold?: <T>(job: () => Promise<T>) => Promise<T>;
}

export async function readCard(url: string, deps: CardDeps, codecs: Codecs = wasmCodecs): Promise<ReaderCard> {
  const hold = deps.hold ?? ((job) => job());
  const page = await fetchLimited(url, "page", deps);
  const head = parseHead(decodeHtml(page.bytes, page.type), page.url);
  if (head === undefined) throw new Refused("empty");
  const picture =
    head.image === undefined
      ? null
      : await fetchLimited(head.image, "picture", deps).then(
          ({ bytes }) => hold(() => reencode(bytes, codecs)),
          () => null,
        );
  return ReaderCard.parse({ title: head.title, description: head.description, site: head.site, picture });
}
