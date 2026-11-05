// AccountName with the page's own parts: the universe the page is in and the two chains the name is read on, from the data files.
// The default export of the one chunk the login's view loads once an account is logged in.
import universes from "../../../data/universes.json" with { type: "json" };
import { MAINNET_CHAIN, ONYX_CHAIN } from "../../lib/chain/names.ts";
import { AccountName } from "./AccountName.tsx";

const chainOf = (chainId: string) => {
  const found = universes.find((each) => each.chainId === chainId);
  if (found === undefined) throw new RangeError(`universes.json holds no chain ${chainId}`);
  return found;
};

interface InPageProps {
  account: string;
  /** The id of the universe the page is in; Onyx's, the default, for none. */
  universe: string | undefined;
  pill: string;
}

export default function InPage({ account, universe, pill }: InPageProps) {
  const here = universes.find((each) => each.id === universe) ?? chainOf(ONYX_CHAIN);
  return (
    <AccountName
      account={account}
      universe={{ ...here, real: !here.testnet }}
      chains={{ mainnet: chainOf(MAINNET_CHAIN), onyx: chainOf(ONYX_CHAIN) }}
      pill={pill}
    />
  );
}
