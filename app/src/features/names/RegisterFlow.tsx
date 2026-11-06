// What a person who asks to pick a name needs: the fee read, the dialog and the card's course that registers. Loaded on its own by
// the account's pill when it is first pressed, so none of it (the call card's parts included) loads with the page (budgets.spec.ts).
import { readCallFees, type CallFees } from "@gnoworld/chain/fees";
import { useEffect, useState } from "react";
import type { Chain } from "../../lib/chain/names.ts";
import { useApp, useAppStore } from "../../storeContext.tsx";
import { feeText, pageParts, type Parts } from "../calls/index.ts";
import { NameDialog } from "./NameDialog.tsx";
import { NAMEREG } from "./nym.ts";
import { phaseOf, type Phase } from "./phase.ts";
import { registerName, registrationOf } from "./registerName.ts";

export interface RegisterFlowProps {
  account: string;
  universe: Chain & { name: string; real: boolean; indexer: string };
  open: boolean;
  onClose: () => void;
  /** Asked after each registration that ran: the chain, not the card, says whether the name is there. */
  onSettled: () => void;
  /** The page's signing parts and fee reader; a test gives its own. */
  deps?: Parts | undefined;
  fees?: typeof readCallFees | undefined;
}

const report = (error: unknown): void => {
  reportError(error);
};

// What the dialog says: the card's course, or a refusal before any card was opened (the signing parts did not load).
function phaseShown(card: Parameters<typeof phaseOf>[0], refused: string | undefined): Phase {
  const typing = card === undefined || card.state.kind === "preview";
  return refused !== undefined && typing ? { kind: "failed", text: refused, again: true } : phaseOf(card);
}

export function RegisterFlow({
  account,
  universe,
  open,
  onClose,
  onSettled,
  deps,
  fees = readCallFees,
}: RegisterFlowProps) {
  const store = useAppStore();
  const [refused, setRefused] = useState<string | undefined>(undefined);
  const [paid, setPaid] = useState<CallFees | undefined>(undefined);
  const card = useApp((state) => registrationOf(state, account, universe.chainId));
  const { indexer } = universe;
  useEffect(() => {
    fees(indexer, { realm: NAMEREG, func: "Register" })
      .then((read) => {
        setPaid(read.ok ? read.value : undefined);
      })
      .catch(report);
  }, [fees, indexer]);
  const register = async (typed: string) => {
    setRefused(undefined);
    const parts = deps ?? (await pageParts(store, universe));
    if (parts === undefined) {
      setRefused("Part of gnoworld that signs did not load, so nothing was sent. Reload the page, then try again.");
      return;
    }
    const result = await registerName(typed, { store, universe, ...parts });
    if (!result.ok) setRefused(result.problem);
    onSettled();
  };
  return (
    <NameDialog
      open={open}
      account={account}
      network={universe}
      fee={feeText(paid)}
      phase={phaseShown(card, refused)}
      onRegister={(typed) => {
        register(typed).catch(report);
      }}
      onClose={onClose}
    />
  );
}
