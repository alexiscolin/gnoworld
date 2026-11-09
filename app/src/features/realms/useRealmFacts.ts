// A realm's facts from the public indexer (5k), read once when a realm's view first draws and again only if the realm or the indexer
// change: one request, no timer, nothing polls. A read that fails is a state of its own, never a blank, and does not touch the
// page's read (RealmView): each is read on its own.
import type { RealmFactsValue } from "@gnoworld/schemas/indexer";
import { useEffect, useState } from "react";
import { heldRead } from "../../lib/chain/heldRead.ts";
import { readRealmFacts } from "../../lib/chain/indexer.ts";
import type { ChainRead, ReadOptions } from "@gnoworld/chain/read";

const NO_OPTIONS: ReadOptions = {};

// The reads of a page of this session with no options of a test's own, by indexer and realm: the plate's standing and the realm's card
// ask the same facts, one request for both (D530). A failed read is asked again.
const held = new Map<string, Promise<ChainRead<RealmFactsValue>>>();

const ask = (indexer: string, realm: string, options: ReadOptions) => {
  if (options !== NO_OPTIONS) return readRealmFacts(indexer, realm, options);
  return heldRead(held, `${indexer} ${realm}`, () => readRealmFacts(indexer, realm, options));
};

/** The facts of `realm` at `indexer`, or none while they are read. */
export function useRealmFacts(
  indexer: string,
  realm: string,
  options: ReadOptions = NO_OPTIONS,
): ChainRead<RealmFactsValue> | undefined {
  const [read, setRead] = useState<{ key: string; value: ChainRead<RealmFactsValue> }>();
  const key = `${indexer} ${realm}`;
  useEffect(() => {
    let live = true;
    ask(indexer, realm, options).then(
      (value) => {
        if (live) setRead({ key, value });
      },
      (error: unknown) => {
        reportError(error);
      },
    );
    return () => {
      live = false;
    };
  }, [key, indexer, realm, options]);
  return read?.key === key ? read.value : undefined;
}
