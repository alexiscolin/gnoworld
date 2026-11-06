// A world's proposals on its plate (5k, frames 20 to 35): the realm's home page read once, its newest proposal under the status
// pill and ring, then the newest few as cards, each with the way to read it on gnoweb. Only what the realm's page states: a page
// that gives no threshold gives no ring and no "of 66.66%". A read that fails says its state and links to the realm on gnoweb.
// This file is a chunk of its own, asked only by a world with a realm (world.tsx): no other page pays for it.
import { Cluster, Stack } from "@gnoworld/ui";
import { lazy, Suspense, useEffect, useState, type ComponentType } from "react";
import { realmAt } from "../../realmAt.ts";
import { gnowebLink } from "../../lib/chain/gnoweb.ts";
import { readProposals } from "../../lib/chain/proposal.ts";
import type { ChainRead, ReadOptions } from "@gnoworld/chain/read";
import type { Proposal } from "../../lib/chain/proposal.ts";
import { ProposalCard, ReadFailed } from "../realms/index.ts";
import { pinnedOf } from "../../pinned.ts";
import type { PinnedBarProps, PinnedFormsProps } from "./Pinned.tsx";
import styles from "./Proposals.module.css";
import { ringOf } from "./statusRing.ts";
import { StatusPill } from "./StatusPill.tsx";

// A world's pinned actions (D271), asked only by a world that pins one; code that cannot be fetched leaves the proposals alone (F1763).
const PinnedForms = lazy<ComponentType<PinnedFormsProps>>(() =>
  import("./Pinned.tsx").then(
    (chunk) => ({ default: chunk.PinnedForms }),
    () => ({ default: () => null }),
  ),
);

/** The most proposals drawn: the newest, as the realm's page lists them. */
const SHOWN = 3;

const NO_OPTIONS: ReadOptions = {};

export interface ProposalsProps {
  /** The realm's view on this site, `/r/gov/dao` or `/net/<universe>/r/gov/dao`: which realm and which chain it is read from. */
  path: string;
  options?: ReadOptions;
  /** The world's pinned actions (D271), drawn first, under Read the proposals. */
  pinned?: Pick<PinnedBarProps, "actions" | "universe">;
}

// The ring of a proposal that gave its tally: the lit share of the orbit and the mark of the threshold, a circle of 1 unit's
// perimeter (pathLength) so a share is its own dash.
function Ring({ proposal }: { proposal: Proposal }) {
  const ring = ringOf(proposal);
  if (ring === undefined) return null;
  return (
    <svg className={styles["ring"]} viewBox="0 0 40 40" aria-hidden="true">
      <circle className={styles["orbit"]} cx="20" cy="20" r="16" pathLength="1" />
      <circle
        className={styles["lit"]}
        cx="20"
        cy="20"
        r="16"
        pathLength="1"
        strokeDasharray={`${String(ring.lit)} 1`}
      />
      <circle
        className={styles["mark"]}
        cx="20"
        cy="20"
        r="16"
        pathLength="1"
        strokeDasharray={`0.01 1`}
        strokeDashoffset={String(-ring.mark)}
      />
    </svg>
  );
}

// What the read holds, in its place: the realm's newest under the pill and ring, then the cards.
function Read({ read, realm, origin }: { read: ChainRead<Proposal[]>; realm: string; origin: string | undefined }) {
  if (!read.ok) return null;
  const [newest] = read.value;
  if (newest === undefined) return <p>This realm lists no proposal.</p>;
  return (
    <>
      <Cluster space="xs">
        <Ring proposal={newest} />
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

export default function Proposals({ path, options = NO_OPTIONS, pinned }: ProposalsProps) {
  const { read, realm, origin } = useProposals(path, options);
  const home = origin === undefined || realm === undefined ? undefined : gnowebLink(origin, realm);
  return (
    <div className={styles["realm"]}>
      <Stack>
        {pinned === undefined ? null : (
          <Suspense fallback={null}>
            <PinnedForms pinned={pinnedOf(pinned.actions, pinned.universe)} options={options} />
          </Suspense>
        )}
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
      </Stack>
    </div>
  );
}
