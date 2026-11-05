// The account control's name (9f): mainnet's name, else Onyx's, else the short address, each read live with its block; "Pick a name"
// for an account logged in with no name on THIS universe's chain, once that read has answered; the dialog that registers one.
// A name is shown only when a read of a chain gives it, never because Adena or the card said so. This file is loaded on its own,
// after the first screen (budgets.spec.ts): the login's view reaches it only through a dynamic import.
import { Button } from "@gnoworld/ui";
import { useState } from "react";
import { MAINNET_CHAIN, readName, shownName } from "../../lib/chain/names.ts";
import { useApp, useAppStore } from "../../storeContext.tsx";
import { pageParts, type Parts } from "../calls/index.ts";
import { NameDialog } from "./NameDialog.tsx";
import { phaseOf, type Phase } from "./phase.ts";
import { useReads } from "./useReads.ts";
import { registerName, registrationOf } from "./registerName.ts";

interface Chain {
  chainId: string;
  rpc: string;
}
export interface AccountNameProps {
  account: string;
  universe: Chain & { name: string; real: boolean };
  chains: { mainnet: Chain; onyx: Chain };
  /** The page's reader and signing parts; a test gives its own. */
  read?: typeof readName;
  deps?: Parts | undefined;
  /** The class of the pill the name is drawn in: the login's. */
  pill?: string | undefined;
}

const COUNT = new Intl.NumberFormat("en-US");
const report = (error: unknown): void => {
  reportError(error);
};

// What the dialog says: the card's course, or a refusal before any card was opened (the signing parts did not load).
function phaseShown(card: Parameters<typeof phaseOf>[0], refused: string | undefined): Phase {
  const typing = card === undefined || card.state.kind === "preview";
  return refused !== undefined && typing ? { kind: "failed", text: refused, again: true } : phaseOf(card);
}

export function AccountName({ account, universe, chains, read = readName, deps, pill }: AccountNameProps) {
  const store = useAppStore();
  // A new read after each registration: the chain, not the card, says whether the name is there.
  const [again, setAgain] = useState(0);
  const [open, setOpen] = useState(false);
  const [refused, setRefused] = useState<string | undefined>(undefined);
  const card = useApp((state) => registrationOf(state, account, universe.chainId));
  const mine = useReads({ account, chains, read }, again);
  const shown = shownName(account, mine);
  const here = mine[universe.chainId === MAINNET_CHAIN ? "mainnet" : "onyx"];
  const where = shown.from === MAINNET_CHAIN ? "gno.land" : "Onyx";
  const register = async (typed: string) => {
    setRefused(undefined);
    const parts = deps ?? (await pageParts(store, universe));
    if (parts === undefined) {
      setRefused("Part of gnoworld that signs did not load, so nothing was sent. Reload the page, then try again.");
      return;
    }
    const result = await registerName(typed, { store, universe, ...parts });
    if (!result.ok) setRefused(result.problem);
    setAgain((count) => count + 1);
  };
  return (
    <>
      <span
        className={pill}
        data-account=""
        title={shown.height === undefined ? account : `${where} · block ${COUNT.format(shown.height)}`}
      >
        {shown.text}
      </span>
      {here?.name === null ? (
        <Button
          size="s"
          emphasis="quiet"
          onClick={() => {
            setOpen(true);
          }}
        >
          Pick a name
        </Button>
      ) : null}
      <NameDialog
        open={open}
        account={account}
        network={universe}
        phase={phaseShown(card, refused)}
        onRegister={(typed) => {
          register(typed).catch(report);
        }}
        onClose={() => {
          setOpen(false);
        }}
      />
    </>
  );
}
