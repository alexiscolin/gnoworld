// A realm's facts from the public indexer (5k), read once when a realm's view first draws and again only if the realm or the indexer
// change: one request, no timer, nothing polls. A read that fails is a state of its own, never a blank, and does not touch the
// page's read (RealmView): each is read on its own.
import type { RealmFactsValue } from "@gnoworld/schemas/indexer";
import { useEffect, useState } from "react";
import { readRealmFacts } from "../../lib/chain/indexer.ts";
import type { ChainRead, ReadOptions } from "../../lib/chain/read.ts";

const NO_OPTIONS: ReadOptions = {};

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
    readRealmFacts(indexer, realm, options).then(
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
