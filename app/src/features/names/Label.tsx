// The name the account's pill shows (9f), read after the first screen, in a chunk of its own: the dialog that registers one (PickName.tsx)
// is another, asked at the menu's item. `again` makes the label read the chains anew once a registration ran.
import { useEffect } from "react";
import { readName, shownName, MAINNET_CHAIN } from "../../lib/chain/names.ts";
import { pageNames } from "./pageNames.ts";
import { useReads } from "./useReads.ts";

interface Props {
  account: string;
  universe: string;
  again: number;
  /** Told whether a name can be picked: the universe's chain answered and the account has none there. */
  onPickable: (pickable: boolean) => void;
  /** A reader of a test's own. */
  read?: typeof readName;
}

const COUNT = new Intl.NumberFormat("en-US");

/** The account's name as the pill says it: mainnet's, else Onyx's, else the short address. */
export function NameLabel({ account, universe, again, onPickable, read = readName }: Props) {
  const { chains, universe: here } = pageNames(universe);
  const reads = useReads({ account, chains, read }, again);
  const shown = shownName(account, reads);
  const pickable = reads[here.chainId === MAINNET_CHAIN ? "mainnet" : "onyx"]?.name === null;
  useEffect(() => {
    onPickable(pickable);
  }, [pickable, onPickable]);
  const where = shown.from === MAINNET_CHAIN ? "gno.land" : "Onyx";
  return (
    <span
      data-account=""
      title={shown.height === undefined ? account : `${where} · block ${COUNT.format(shown.height)}`}
    >
      {shown.text}
    </span>
  );
}
