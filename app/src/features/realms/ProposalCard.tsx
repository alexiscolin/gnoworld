// A GovDAO proposal as a card (5k, ADR-0002 §4, "Proposal cards", read only: votes stay in their realms): its number, its title,
// its state, its tally when the realm gave one, where and when it was read, and the way to read it on gnoweb. The realm's words
// are text; the link is drawn only when it is one of gnoweb's own addresses. No vote button.
import { cutGraphemes } from "@gnoworld/core";
import { Card } from "@gnoworld/ui";
import type { Proposal } from "../../lib/chain/proposal.ts";
import { tallyOf } from "../../lib/chain/tally.ts";
import type { Source } from "../../lib/chain/read.ts";
import { ReadSource } from "./ReadSource.tsx";

/** The graphemes of a title a card shows, at most. */
const CARD_TITLE = 120;

export interface ProposalCardProps {
  proposal: Proposal;
  source: Source;
  /** The proposal on gnoweb, from `gnowebLink` (lib/chain/gnoweb.ts); no link is drawn without one. */
  href?: string;
}

export function ProposalCard({ proposal, source, href }: ProposalCardProps) {
  const tally = tallyOf(proposal);
  return (
    <Card compact>
      <Card.Header title={cutGraphemes(proposal.title, CARD_TITLE)} kicker="Proposal" />
      <Card.Body>
        <p data-field="number">{`Proposal ${String(proposal.id)}`}</p>
        {proposal.state === "" ? null : <p data-field="state">{proposal.state}</p>}
        {tally === undefined ? null : <p data-field="tally">{tally}</p>}
        <ReadSource source={source} />
        {href === undefined ? null : (
          <a href={href} target="_blank" rel="noopener noreferrer">
            Read it on gnoweb
          </a>
        )}
      </Card.Body>
    </Card>
  );
}
