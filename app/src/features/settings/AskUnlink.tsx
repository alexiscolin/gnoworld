import type { Address } from "@gnoworld/schemas";
import { shortAddress } from "@gnoworld/schemas";
import { ConfirmDialog } from "../../ConfirmDialog.tsx";

// The dialog that asks before the account logged in leaves its identity: what stops, and that the others stay linked; `close` says whether to go on.
export function AskUnlink({ address, own, close }: { address: Address; own: boolean; close: (go: boolean) => void }) {
  return (
    <ConfirmDialog
      title={own ? "Unlink this account?" : "Unlink this address?"}
      description={shortAddress(address)}
      open
      cancel="Cancel"
      go="Unlink"
      close={close}
    >
      It stops moderating the worlds the other accounts own, and they stop moderating the worlds it owns. You stay
      logged in.
    </ConfirmDialog>
  );
}
