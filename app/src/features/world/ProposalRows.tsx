// The Proposals card's rows (the proposal's .rc): a number, the title cut to the line, the state as a chip, the row a link to the proposal on gnoweb.
import { PagedList } from "@gnoworld/ui";
import type { ChainRead } from "@gnoworld/chain/read";
import { gnowebLink } from "../../lib/chain/gnoweb.ts";
import type { Proposal } from "../../lib/chain/proposal.ts";
import { ReadSource } from "../realms/index.ts";
import { ProposalRow as Row } from "../../ProposalRow.tsx";
import { StatusPill } from "./StatusPill.tsx";

/** The most rows drawn: the newest, as the realm's page lists them. */
export const SHOWN = 3;

// The open proposal the realm's page gave votes for, whose pill and ring stand for the realm; none when none is open.
export const openOf = (proposals: readonly Proposal[]) => proposals.find(({ yes }) => yes !== undefined);

// What the read holds, in its place: the open proposal's numbers when it gave them, then the newest rows.
export function Read({
  read,
  realm,
  origin,
}: {
  read: ChainRead<Proposal[]>;
  realm: string;
  origin: string | undefined;
}) {
  if (!read.ok) return null;
  const [newest] = read.value;
  if (newest === undefined) return <p>This realm lists no proposal.</p>;
  const open = openOf(read.value);
  return (
    <>
      {open === undefined ? null : <StatusPill proposal={open} />}
      <PagedList
        label="proposals"
        items={read.value}
        keyOf={({ id }) => String(id)}
        textOf={({ title }) => title}
        render={(proposal) => (
          <Row proposal={proposal} href={origin === undefined ? undefined : gnowebLink(origin, realm, proposal.id)} />
        )}
        page={SHOWN}
        bare
        counted={false}
      />
      <ReadSource source={read.source} />
    </>
  );
}
