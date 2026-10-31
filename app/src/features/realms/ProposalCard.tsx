// A GovDAO proposal as a card (5k, ADR-0002 §4, "Proposal cards", read only: votes stay in their realms): its number, its title,
// its state, its tally when the realm gave one, where and when it was read, and the way to read it on gnoweb. The realm's words
// are text; the link is drawn only when it is one of gnoweb's own addresses. No vote button.
import { cutGraphemes } from "@gnoworld/core";
import { Card } from "@gnoworld/ui";
import { isGnowebAddress } from "../../lib/chain/gnoweb.ts";
import { tallyOf, type Proposal } from "../../lib/chain/proposal.ts";
import type { ChainRead, Source } from "../../lib/chain/read.ts";
import { ReadFailed, ReadSource } from "./ReadSource.tsx";

/** The graphemes of a title a card shows, at most. */
const CARD_TITLE = 120;

export interface ProposalCardProps {
  proposal: Proposal;
  source: Source;
  /** The proposal on gnoweb; drawn as a link only when it is a realm page on one of gnoweb's origins. */
  href: string;
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
        {isGnowebAddress(href) ? (
          <a href={href} target="_blank" rel="noopener noreferrer">
            Read it on gnoweb
          </a>
        ) : null}
      </Card.Body>
    </Card>
  );
}

/** A proposal's read as the page draws it: the card, or the failure with its next step. */
export function ProposalView({ read, href }: { read: ChainRead<Proposal>; href: string }) {
  return read.ok ? (
    <ProposalCard proposal={read.value} source={read.source} href={href} />
  ) : (
    <ReadFailed failure={read.failure} source={read.source} />
  );
}
