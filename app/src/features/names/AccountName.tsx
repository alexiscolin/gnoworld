// The account control's name (9f): mainnet's name, else Onyx's, else the short address, each read live with its block. With no
// name on THIS universe's chain, once that read has answered, the pill is the way to pick one. A name is shown only when a read of a
// chain gives it. The dialog and what signs load on the first press (RegisterFlow.tsx); this file's chunk loads after the first screen.
import type { readCallFees } from "@gnoworld/chain/fees";
import { Avatar } from "@gnoworld/ui";
import { useState } from "react";
import { MAINNET_CHAIN, readName, shownName, type Chain } from "../../lib/chain/names.ts";
import type { Parts } from "../calls/index.ts";
import styles from "./AccountName.module.css";
import type { RegisterFlow } from "./RegisterFlow.tsx";
import { useReads } from "./useReads.ts";

export interface AccountNameProps {
  account: string;
  universe: Chain & { name: string; real: boolean; indexer: string };
  chains: { mainnet: Chain; onyx: Chain };
  /** A reader, the signing parts and a fee reader of a test's own. */
  read?: typeof readName;
  deps?: Parts | undefined;
  fees?: typeof readCallFees | undefined;
  /** The class of the pill the name is drawn in: the login's. */
  pill?: string | undefined;
}

// Outside the component: the compiler does not take an import() inside one.
const load = () => import("./RegisterFlow.tsx");
const COUNT = new Intl.NumberFormat("en-US");
const report = (error: unknown): void => {
  reportError(error);
};

export function AccountName({ account, universe, chains, read = readName, deps, fees, pill = "" }: AccountNameProps) {
  // A new read after each registration: the chain, not the card, says whether the name is there.
  const [again, setAgain] = useState(0);
  const [open, setOpen] = useState(false);
  const [flow, setFlow] = useState<{ Flow: typeof RegisterFlow } | undefined>(undefined);
  const mine = useReads({ account, chains, read }, again);
  const shown = shownName(account, mine);
  const here = mine[universe.chainId === MAINNET_CHAIN ? "mainnet" : "onyx"];
  const where = shown.from === MAINNET_CHAIN ? "gno.land" : "Onyx";
  const title = shown.height === undefined ? account : `${where} · block ${COUNT.format(shown.height)}`;
  const face = (
    <span className={styles["row"]}>
      <Avatar address={account} name={shown.text} size="m" decorative />
      {shown.text}
    </span>
  );
  const ask = () => {
    setOpen(true);
    if (flow === undefined)
      load().then((loaded) => {
        setFlow({ Flow: loaded.RegisterFlow });
      }, report);
  };
  return (
    <>
      {here?.name === null ? (
        <button
          type="button"
          className={`${pill} ${styles["opener"] ?? ""}`}
          data-account=""
          aria-label={`Pick a name for ${shown.text}`}
          title={title}
          onClick={ask}
        >
          {face}
        </button>
      ) : (
        <span className={pill} data-account="" title={title}>
          {face}
        </span>
      )}
      {flow === undefined ? null : (
        <flow.Flow
          account={account}
          universe={universe}
          open={open}
          deps={deps}
          fees={fees}
          onSettled={() => {
            setAgain((count) => count + 1);
          }}
          onClose={() => {
            setOpen(false);
          }}
        />
      )}
    </>
  );
}
