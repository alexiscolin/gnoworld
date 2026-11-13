// A world's proposals on its plate (5k, frames 20 to 35): the realm's home page read once, its newest proposal under the status
// pill, then the newest few as cards, each with the way to read it on gnoweb. Only what the realm's page states: a page that gives no
// threshold gives no ring and no "of 66.66%". The ring is the scene's tilted orbit (7e), handed to the page. A read that fails says its
// state and links to the realm on gnoweb. This file is a chunk of its own, asked only by a world with a realm (world.tsx).
import { Button, Card, Cluster, Stack } from "@gnoworld/ui";
import { lazy, Suspense, useEffect, useRef, type ComponentType } from "react";
import { reportedOr } from "../../lib/reported.ts";
import { realmAt } from "../../realmAt.ts";
import { gnowebLink } from "../../lib/chain/gnoweb.ts";
import { useQuery } from "@tanstack/react-query";
import { isUnread, queryClient } from "../../lib/query/client.ts";
import { proposalsOptions } from "../../lib/query/proposalsQuery.ts";
import type { ChainRead, ReadOptions } from "@gnoworld/chain/read";
import type { Proposal } from "../../lib/chain/proposal.ts";
import { ReadFailed } from "../realms/index.ts";
import { pinnedOf } from "../../pinned.ts";
import type { PinnedBarProps, PinnedFormsProps } from "./Pinned.tsx";
import { ringOf, type Ring } from "./statusRing.ts";
import { StatusPill } from "./StatusPill.tsx";
import { openOf, Read, SHOWN } from "./ProposalRows.tsx";

// A world's pinned actions (D271), asked only by a world that pins one; code that cannot be fetched leaves the proposals alone (F1763).
// The chat's bar takes them from this module too, which the world's page imports once for both (the first screen holds a list of
// what each import preloads).
const pinnedChunk = () => import("./Pinned.tsx");
const none = () => ({ default: () => null });
const PinnedForms = lazy<ComponentType<PinnedFormsProps>>(() =>
  reportedOr(
    pinnedChunk().then((chunk) => ({ default: chunk.PinnedForms })),
    none(),
  ),
);
const PinnedBarPart = lazy<ComponentType<PinnedBarProps>>(() =>
  reportedOr(
    pinnedChunk().then((chunk) => ({ default: chunk.PinnedBar })),
    none(),
  ),
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

// The realm a path names and its proposals: the kept list at once, then the fresh one (a failed fresh read leaves the one shown).
function useProposals(path: string, options: ReadOptions) {
  const at = realmAt(path);
  const realm = at?.realm;
  const { data, error } = useQuery(
    {
      ...proposalsOptions(at?.chain.rpc ?? "", realm ?? "", options),
      enabled: at !== undefined,
    },
    queryClient,
  );
  const read = data ?? (isUnread<ChainRead<Proposal[]>>(error) ? error.read : undefined);
  return { read, realm, origin: at?.chain.gnoweb };
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

// What the card's body says: that the read is on its way, what it read, or why it failed.
function Body({
  read,
  realm,
  origin,
}: {
  read: ChainRead<Proposal[]> | undefined;
  realm: string | undefined;
  origin: string | undefined;
}) {
  if (read === undefined || realm === undefined)
    return (
      <p className="label" role="status">
        Reading the proposals
      </p>
    );
  return read.ok ? (
    <Read read={read} realm={realm} origin={origin} />
  ) : (
    <ReadFailed failure={read.failure} source={read.source} />
  );
}

export default function Proposals({ path, options = NO_OPTIONS, onRing, pinned }: ProposalsProps) {
  const { read, realm, origin } = useProposals(path, options);
  useRing(read, onRing);
  const home = origin === undefined || realm === undefined ? undefined : gnowebLink(origin, realm);
  const listed = read?.ok === true ? read.value.length : 0;
  return (
    <>
      {pinned === undefined ? null : (
        <Suspense fallback={null}>
          <PinnedForms pinned={pinnedOf(pinned.actions, pinned.universe)} options={options} />
        </Suspense>
      )}
      <Card look="hub" rises>
        <Card.Header
          icon="check"
          title="Proposals"
          level={2}
          {...(listed === 0
            ? {}
            : { hint: `newest ${String(Math.min(SHOWN, listed))} of ${String(listed)} \u00b7 titles shortened` })}
        />
        <Card.Body>
          <Stack space="s">
            <Body read={realm === undefined ? undefined : read} realm={realm} origin={origin} />
            {home === undefined ? null : (
              <div>
                <Button size="s" icon="arrow-up-right" href={home}>
                  Read them on gnoweb
                </Button>
              </div>
            )}
          </Stack>
        </Card.Body>
      </Card>
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
