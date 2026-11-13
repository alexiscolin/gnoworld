// A proposal as a row of a card: its number, its title cut to the line, its state as a chip; the row opens it on gnoweb. Shared by a world's
// proposals card and the chat's.
import { Chip, Row } from "@gnoworld/ui";
import { toneOf, type Proposal } from "./lib/chain/proposal.ts";
import styles from "./ProposalRow.module.css";

export function ProposalRow({ proposal, href }: { proposal: Proposal; href: string | undefined }) {
  return (
    <Row
      truncate
      lead={<code className={["plain-code", styles["number"]].join(" ")}>{`#${String(proposal.id)}`}</code>}
      title={proposal.title}
      trail={
        proposal.state === "" ? undefined : (
          <Chip
            tone={toneOf(proposal.state)}
          >{`${proposal.state.charAt(0)}${proposal.state.slice(1).toLowerCase()}`}</Chip>
        )
      }
      {...(href === undefined ? {} : { href, external: true })}
    />
  );
}
