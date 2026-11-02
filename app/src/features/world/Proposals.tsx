// A world's proposals on its plate (5k, frames 20 to 35): the realm's home page read once, its newest proposal under the status
// pill, then the newest few as cards, each with the way to read it on gnoweb. Only what the realm's page states: a page that gives no
// threshold gives no ring and no "of 66.66%". The ring is the scene's tilted orbit (7e), handed to the page. A read that fails says its
// state and links to the realm on gnoweb. This file is a chunk of its own, asked only by a world with a realm (world.tsx).
import { Cluster, Stack } from "@gnoworld/ui";
import { useEffect, useState } from "react";
import { realmAt } from "../../realmAt.ts";
import { gnowebLink } from "../../lib/chain/gnoweb.ts";
import { readProposals } from "../../lib/chain/proposal.ts";
import type { ChainRead, ReadOptions } from "../../lib/chain/read.ts";
import type { Proposal } from "../../lib/chain/proposal.ts";
import { ProposalCard, ReadFailed } from "../realms/index.ts";
import { ringOf, type Ring } from "./statusRing.ts";
import { StatusPill } from "./StatusPill.tsx";

/** The most proposals drawn: the newest, as the realm's page lists them. */
const SHOWN = 3;

const NO_OPTIONS: ReadOptions = {};

export interface ProposalsProps {
  /** The realm's view on this site, `/r/gov/dao` or `/net/<universe>/r/gov/dao`: which realm and which chain it is read from. */
  path: string;
  options?: ReadOptions;
  /** Hands the page the newest proposal's ring once read, none when it gave no tally or the read failed, and none on leaving. */
  onRing?: (ring: Ring | undefined) => void;
}

// What the read holds, in its place: the realm's newest under the pill, then the cards.
function Read({ read, realm, origin }: { read: ChainRead<Proposal[]>; realm: string; origin: string | undefined }) {
  if (!read.ok) return null;
  const [newest] = read.value;
  if (newest === undefined) return <p>This realm lists no proposal.</p>;
  return (
    <>
      <Cluster space="xs">
        <StatusPill proposal={newest} />
      </Cluster>
      {read.value.slice(0, SHOWN).map((proposal) => {
        const href = origin === undefined ? undefined : gnowebLink(origin, realm, proposal.id);
        return (
          <ProposalCard
            key={proposal.id}
            proposal={proposal}
            source={read.source}
            {...(href === undefined ? {} : { href })}
          />
        );
      })}
    </>
  );
}

// A read that failed: its state with the next step, and the realm on gnoweb.
function Failed({ read, home }: { read: ChainRead<Proposal[]>; home: string | undefined }) {
  if (read.ok) return null;
  return (
    <>
      <ReadFailed failure={read.failure} source={read.source} />
      {home === undefined ? null : (
        <a href={home} target="_blank" rel="noopener noreferrer">
          Read them on gnoweb
        </a>
      )}
    </>
  );
}

// The realm a path names and its proposals, read once: one request, no timer.
function useProposals(path: string, options: ReadOptions) {
  const [read, setRead] = useState<ChainRead<Proposal[]>>();
  const at = realmAt(path);
  const realm = at?.realm;
  const rpc = at?.chain.rpc;
  useEffect(() => {
    if (realm === undefined || rpc === undefined) return;
    let live = true;
    readProposals(rpc, realm, options).then(
      (value) => {
        if (live) setRead(value);
      },
      (error: unknown) => {
        reportError(error);
      },
    );
    return () => {
      live = false;
    };
  }, [rpc, realm, options]);
  const origin = at?.chain.gnoweb;
  return { read, realm, origin };
}

// The ring goes to the page as the read comes, and leaves it with this block.
function useRing(read: ChainRead<Proposal[]> | undefined, onRing: ProposalsProps["onRing"]) {
  useEffect(() => {
    if (read === undefined || onRing === undefined) return;
    const [newest] = read.ok ? read.value : [];
    onRing(newest === undefined ? undefined : ringOf(newest));
  }, [read, onRing]);
  useEffect(
    () => () => {
      onRing?.(undefined);
    },
    [onRing],
  );
}

export default function Proposals({ path, options = NO_OPTIONS, onRing }: ProposalsProps) {
  const { read, realm, origin } = useProposals(path, options);
  useRing(read, onRing);
  const home = origin === undefined || realm === undefined ? undefined : gnowebLink(origin, realm);
  return (
    <section aria-labelledby="proposals-title">
      <Stack space="xs">
        <h2 id="proposals-title" className="label">
          Proposals
        </h2>
        {read === undefined || realm === undefined ? (
          <p className="label" role="status">
            Reading the proposals
          </p>
        ) : read.ok ? (
          <Read read={read} realm={realm} origin={origin} />
        ) : (
          <Failed read={read} home={home} />
        )}
      </Stack>
    </section>
  );
}
