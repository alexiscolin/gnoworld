// The /proposals card among a chat room's lines: the universe's GovDAO, its open proposals first, each with the existing Vote (the
// call card, with its warning), then the last three with their status; the realm's own page read as the world page reads it
// (proposalsOptions), kept five minutes. A proposer's title is text, cleaned of hidden characters and cut. A chunk of its own, asked by the chat.
import type { ChainRead } from "@gnoworld/chain/read";
import { cutText } from "@gnoworld/core/bubbles";
import { Button, Card, Stack } from "@gnoworld/ui";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "react-router";
import { gnowebLink } from "../../lib/chain/gnoweb.ts";
import type { Proposal } from "../../lib/chain/proposal.ts";
import { isUnread, queryClient } from "../../lib/query/client.ts";
import { proposalsOptions } from "../../lib/query/proposalsQuery.ts";
import { realmView, site } from "../../places.ts";
import { ProposalRow as Row } from "../../ProposalRow.tsx";
import { realmAt } from "../../realmAt.ts";
import { ActionForm } from "../realms/index.ts";

const GOVDAO = "gno.land/r/gov/dao";
const FIVE_MINUTES = 5 * 60_000;
/** The last proposals shown after the open ones, and the open ones shown with their Vote. */
const LAST = 3;
const OPEN_MOST = 5;
const TITLE = 120;

// The realm's word for a proposal open for votes.
const isOpen = ({ state }: Proposal): boolean => state === "ACTIVE";

/** The proposals as the card lists them: the open ones, then the last `LAST` that are not, titles cleaned and cut. */
export function listed(all: readonly Proposal[]): { open: Proposal[]; last: Proposal[] } {
  const clean = (proposal: Proposal): Proposal => ({ ...proposal, title: cutText(proposal.title, TITLE) });
  return {
    open: all.filter(isOpen).slice(0, OPEN_MOST).map(clean),
    last: all
      .filter((proposal) => !isOpen(proposal))
      .slice(0, LAST)
      .map(clean),
  };
}

// The realm's page in the reader's universe, and its proposals as the query holds them: none while they come.
function useGovDao() {
  const page = realmView(GOVDAO, site.universeAt(useLocation().pathname));
  const at = realmAt(page);
  const { data, error } = useQuery(
    { ...proposalsOptions(at?.chain.rpc ?? "", GOVDAO), staleTime: FIVE_MINUTES, enabled: at !== undefined },
    queryClient,
  );
  const read = data ?? (isUnread<ChainRead<Proposal[]>>(error) ? error.read : undefined);
  return { page, at, read };
}

// What the card says when it has no open proposal to show: that they come, why they did not, or that none is open.
function wordsOf(read: ChainRead<Proposal[]> | undefined, at: unknown, open: number): string | undefined {
  if (at === undefined || read?.ok === false) return "The proposals could not be read. Open the realm to try again.";
  if (read === undefined) return "Reading the proposals";
  return open === 0 ? "No proposal is open for a vote." : undefined;
}

export default function ChatProposals() {
  const { page, at, read } = useGovDao();
  const { open, last } = read?.ok === true ? listed(read.value) : { open: [], last: [] };
  const origin = at?.chain.gnoweb;
  const words = wordsOf(read, at, open.length);
  const link = (proposal: Proposal) => (origin === undefined ? undefined : gnowebLink(origin, GOVDAO, proposal.id));
  return (
    <Card compact>
      <Card.Header icon="check" kicker="GovDAO" title="Proposals" />
      <div data-proposals-card="">
        <Stack space="s">
          {words === undefined ? null : (
            <p className="meta" role="status">
              {words}
            </p>
          )}
          {open.map((proposal) => (
            <div key={proposal.id}>
              <Row proposal={proposal} href={link(proposal)} />
              {at === undefined ? null : (
                <ActionForm
                  action={{ realm: GOVDAO, function: "MustVoteOnProposalSimple", args: { pid: String(proposal.id) } }}
                  label="Vote"
                  chain={at.chain}
                />
              )}
            </div>
          ))}
          {last.map((proposal) => (
            <Row key={proposal.id} proposal={proposal} href={link(proposal)} />
          ))}
          <div>
            <Button size="s" icon="arrow-up-right" href={page}>
              Open GovDAO
            </Button>
          </div>
        </Stack>
      </div>
    </Card>
  );
}
