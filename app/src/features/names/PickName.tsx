// The dialog that registers a name on the page's universe (9f): the fee read, the card and its signing parts come with it, at the account menu's
// "Pick a name", never with the label.
import { pageNames } from "./pageNames.ts";
import { RegisterFlow } from "./RegisterFlow.tsx";

export function PickName({
  account,
  universe,
  open,
  onSettled,
  onClose,
}: {
  account: string;
  universe: string;
  open: boolean;
  onSettled: () => void;
  onClose: () => void;
}) {
  const { universe: here } = pageNames(universe);
  return <RegisterFlow account={account} universe={here} open={open} onSettled={onSettled} onClose={onClose} />;
}
