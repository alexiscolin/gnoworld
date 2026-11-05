// What the chains give of an account's name, read again when the account or the universe's chains change or `again` does.
import { useEffect, useState } from "react";
import type { Chain, readName, Named } from "../../lib/chain/names.ts";

/** What was read for one account: a chain with no answer, or a failed one, is not here. */
export interface Reads {
  mainnet?: Named | undefined;
  onyx?: Named | undefined;
}
interface Held extends Reads {
  account: string;
}

const report = (error: unknown): void => {
  reportError(error);
};

export function useReads(
  { account, chains, read }: { account: string; chains: { mainnet: Chain; onyx: Chain }; read: typeof readName },
  again: number,
): Reads {
  const [held, setHeld] = useState<Held>({ account });
  useEffect(() => {
    // An answer for an account that is no longer the page's is dropped.
    let current = true;
    for (const slot of ["mainnet", "onyx"] as const) {
      const { rpc, chainId } = chains[slot];
      read(rpc, { chainId, account })
        .then((answer) => {
          if (current)
            setHeld((before) => ({
              ...(before.account === account ? before : { account }),
              [slot]: answer.ok ? answer.value : undefined,
            }));
        })
        .catch(report);
    }
    return () => {
      current = false;
    };
  }, [account, chains, read, again]);
  return held.account === account ? held : {};
}
