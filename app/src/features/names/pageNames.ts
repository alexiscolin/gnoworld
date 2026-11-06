// The universe the page is in and the two chains a name is read on, from the data files (9f).
import universes from "../../../data/universes.json" with { type: "json" };
import { MAINNET_CHAIN, ONYX_CHAIN } from "../../lib/chain/names.ts";

const chainOf = (chainId: string) => {
  const found = universes.find((each) => each.chainId === chainId);
  if (found === undefined) throw new RangeError(`universes.json holds no chain ${chainId}`);
  return found;
};

export function pageNames(universe: string | undefined) {
  const here = universes.find((each) => each.id === universe) ?? universes.find((each) => each.default === true);
  if (here === undefined) throw new RangeError("universes.json holds no default universe");
  return {
    universe: { ...here, real: !here.testnet },
    chains: { mainnet: chainOf(MAINNET_CHAIN), onyx: chainOf(ONYX_CHAIN) },
  };
}
