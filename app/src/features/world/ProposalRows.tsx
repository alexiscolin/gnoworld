// The Proposals card's rows (the proposal's .rc): a number, the title cut to the line, the state as a chip, the row a link to the proposal on gnoweb.
import { Chip, PagedList } from "@gnoworld/ui";
import type { ChainRead } from "@gnoworld/chain/read";
import { gnowebLink } from "../../lib/chain/gnoweb.ts";
import type { Proposal } from "../../lib/chain/proposal.ts";
import { ReadSource } from "../realms/index.ts";
import styles from "./Proposals.module.css";
import { StatusPill } from "./StatusPill.tsx";

/** The most rows drawn: the newest, as the realm's page lists them. */
export const SHOWN = 3;

// The open proposal the realm's page gave votes for, whose pill and ring stand for the realm; none when none is open.
export const openOf = (proposals: readonly Proposal[]) => proposals.find(({ yes }) => yes !== undefined);

// A state's chip: the realm's word, in the tone it says (accepted in the mint, open in the signal's, refused in the danger's).
const toneOf = (state: string) =>
  /accept|pass|execut/i.test(state)
    ? "mine"
    : /activ|open/i.test(state)
      ? "signal"
      : /reject|fail|refus|deni/i.test(state)
        ? "danger"
        : "neutral";

// A proposal as a row of the card (the proposal's .rc): its number, its title cut to the line, its state as a chip; the row opens it on gnoweb.
function Row({ proposal, href }: { proposal: Proposal; href: string | undefined }) {
  const row = (
    <>
      <code className="plain-code">{`#${String(proposal.id)}`}</code>
      <span className="truncate">{proposal.title}</span>
      {proposal.state === "" ? (
        <span />
      ) : (
        <Chip
          tone={toneOf(proposal.state)}
        >{`${proposal.state.charAt(0)}${proposal.state.slice(1).toLowerCase()}`}</Chip>
      )}
    </>
  );
  return href === undefined ? (
    <div className="list-row icon-text-meta">{row}</div>
  ) : (
    <div className={["list-row", "icon-text-meta", styles["row"]].join(" ")} data-link="">
      <a
        className={styles["cover"]}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Read proposal ${String(proposal.id)} on gnoweb`}
      />
      {row}
    </div>
  );
}

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
