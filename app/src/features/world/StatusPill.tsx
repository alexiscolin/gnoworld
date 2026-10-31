// The pill that carries the ring's numbers (5k, frames 22 and 27): `Proposal 15 · YES 33% of 66.66%`, so the state never rests on
// the ring alone. A realm that gave no tally gets the proposal's name and no number. A status the screen reader says, not a button.
import { isProposalId, tallyOf, type Proposal } from "../../lib/chain/proposal.ts";

export function StatusPill({ proposal }: { proposal: Pick<Proposal, "id" | "yes" | "threshold"> }) {
  if (!isProposalId(proposal.id)) return null;
  const tally = tallyOf(proposal);
  return (
    <span role="status" className="label">
      {`Proposal ${String(proposal.id)}${tally === undefined ? "" : ` · ${tally}`}`}
    </span>
  );
}
