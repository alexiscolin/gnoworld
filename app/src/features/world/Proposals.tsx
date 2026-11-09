// A world's proposals on its plate (5k, frames 20 to 35): the realm's home page read once, its newest proposal under the status
// pill, then the newest few as cards, each with the way to read it on gnoweb. Only what the realm's page states: a page that gives no
// threshold gives no ring and no "of 66.66%". The ring is the scene's tilted orbit (7e), handed to the page. A read that fails says its
// state and links to the realm on gnoweb. This file is a chunk of its own, asked only by a world with a realm (world.tsx).
import { Cluster, Stack } from "@gnoworld/ui";
import { lazy, Suspense, useEffect, useRef, useState, type ComponentType } from "react";
import { realmAt } from "../../realmAt.ts";
import { gnowebLink } from "../../lib/chain/gnoweb.ts";
import { readProposals } from "../../lib/chain/proposal.ts";
import type { ChainRead, ReadOptions } from "@gnoworld/chain/read";
import type { Proposal } from "../../lib/chain/proposal.ts";
import { ProposalCard, ReadFailed } from "../realms/index.ts";
import { pinnedOf } from "../../pinned.ts";
import type { PinnedBarProps, PinnedFormsProps } from "./Pinned.tsx";
import { ringOf, type Ring } from "./statusRing.ts";
import { StatusPill } from "./StatusPill.tsx";

// A world's pinned actions (D271), asked only by a world that pins one; code that cannot be fetched leaves the proposals alone (F1763).
// The chat's bar takes them from this module too, which the world's page imports once for both (the first screen holds a list of
// what each import preloads).
const pinnedChunk = () => import("./Pinned.tsx");
const none = () => ({ default: () => null });
const PinnedForms = lazy<ComponentType<PinnedFormsProps>>(() =>
  pinnedChunk().then((chunk) => ({ default: chunk.PinnedForms }), none),
);
const PinnedBarPart = lazy<ComponentType<PinnedBarProps>>(() =>
  pinnedChunk().then((chunk) => ({ default: chunk.PinnedBar }), none),
);

/** The chat's bar's part of a world's pinned actions, as its code comes (a lazy component resolves to a function, never to another
 * lazy one: React's error 306). */
export function PinnedBar(props: PinnedBarProps) {
  return (
    <Suspense fallback={null}>
      <PinnedBarPart {...props} />
    </Suspense>
  );
}

/** The most proposals drawn: the newest, as the realm's page lists them. */
const SHOWN = 3;

const NO_OPTIONS: ReadOptions = {};

export interface ProposalsProps {
  /** The realm's view on this site, `/r/gov/dao` or `/net/<universe>/r/gov/dao`: which realm and which chain it is read from. */
  path: string;
  options?: ReadOptions;
  /** Hands the page the newest proposal's ring once read, none when it gave no tally or the read failed, and none on leaving. */
  onRing?: (ring: Ring | undefined) => void;
  /** The world's pinned actions (D271), drawn first, under Read the proposals. */
  pinned?: Pick<PinnedBarProps, "actions" | "universe">;
}

// The open proposal the realm's page gave votes for (lib/chain/proposal.ts reads the newest open one's), whose pill and ring stand for the
// realm; none when none is open.
const openOf = (proposals: readonly Proposal[]) => proposals.find(({ yes }) => yes !== undefined);

// What the read holds, in its place: the open proposal, or the newest, under the pill, then the cards.
function Read({ read, realm, origin }: { read: ChainRead<Proposal[]>; realm: string; origin: string | undefined }) {
  if (!read.ok) return null;
  const [newest] = read.value;
  if (newest === undefined) return <p>This realm lists no proposal.</p>;
  return (
    <>
      <Cluster space="xs">
        <StatusPill proposal={openOf(read.value) ?? newest} />
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
  const [held, setHeld] = useState<{ readonly from: string; readonly read: ChainRead<Proposal[]> }>();
  const at = realmAt(path);
  const realm = at?.realm;
  const rpc = at?.chain.rpc;
  const from = `${String(rpc)} ${String(realm)}`;
  useEffect(() => {
    if (realm === undefined || rpc === undefined) return;
    let live = true;
    readProposals(rpc, realm, options).then(
      (value) => {
        if (live) setHeld({ from: `${rpc} ${realm}`, read: value });
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
  // A read of another realm, the page having moved since, is none of this one's.
  return { read: held?.from === from ? held.read : undefined, realm, origin };
}

// The ring goes to the page as the read comes, leaves it while another realm's is on its way, and leaves it with this block.
function useRing(read: ChainRead<Proposal[]> | undefined, onRing: ProposalsProps["onRing"]) {
  const handedRef = useRef(false);
  useEffect(() => {
    if (onRing === undefined || (read === undefined && !handedRef.current)) return;
    const open = read?.ok === true ? openOf(read.value) : undefined;
    onRing(open === undefined ? undefined : ringOf(open));
    handedRef.current = read !== undefined;
  }, [read, onRing]);
  useEffect(
    () => () => {
      onRing?.(undefined);
    },
    [onRing],
  );
}

export default function Proposals({ path, options = NO_OPTIONS, onRing, pinned }: ProposalsProps) {
  const { read, realm, origin } = useProposals(path, options);
  useRing(read, onRing);
  const home = origin === undefined || realm === undefined ? undefined : gnowebLink(origin, realm);
  return (
    <>
      {pinned === undefined ? null : (
        <Suspense fallback={null}>
          <PinnedForms pinned={pinnedOf(pinned.actions, pinned.universe)} options={options} />
        </Suspense>
      )}
      <section aria-labelledby="proposals-title">
        <Stack space="xs">
          {/* The plate's kicker's look, its dot included, on the section's heading. */}
          <h2 id="proposals-title" className="label">
            <span className="dot" data-tone="world" aria-hidden="true" />
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
    </>
  );
}

/** A realm's open proposal as its pill alone (D375), and its ring handed to the page: one read, nothing when none is open. */
export function Status({ path, onRing }: Pick<ProposalsProps, "path" | "onRing">) {
  const { read } = useProposals(path, NO_OPTIONS);
  useRing(read, onRing);
  const open = read?.ok === true ? openOf(read.value) : undefined;
  return open === undefined ? null : (
    <Cluster space="xs">
      <StatusPill proposal={open} />
    </Cluster>
  );
}
