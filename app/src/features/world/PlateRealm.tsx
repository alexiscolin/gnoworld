// A world with a realm reads its proposals in a chunk of its own, after the page has hydrated: no other world pays for it. The chat's bar
// takes a world's pinned actions (D271) from that module too (the chat reaches no realm code of its own); code that cannot be fetched
// leaves its place alone (F1763). This file holds only the doors to that chunk.
import { lazy, Suspense, type ComponentType } from "react";
import { reportedOr } from "../../lib/reported.ts";
import type { site } from "../../places.ts";
import type { PinnedBarProps } from "./Pinned.tsx";
import type { ProposalsProps } from "./Proposals.tsx";
import type { Ring } from "./statusRing.ts";

const realmPart = () => import("./Proposals.tsx");
const none = () => ({ default: () => null });
const Proposals = lazy<ComponentType<ProposalsProps>>(() => reportedOr(realmPart(), none()));
const Status = lazy<ComponentType<Pick<ProposalsProps, "path" | "onRing">>>(() =>
  reportedOr(
    realmPart().then((chunk) => ({ default: chunk.Status })),
    none(),
  ),
);
const PinnedBar = lazy<ComponentType<PinnedBarProps>>(() =>
  reportedOr(
    realmPart().then((chunk) => ({ default: chunk.PinnedBar })),
    none(),
  ),
);

interface Universe {
  id: string;
  isDefault: boolean;
}
type World = ReturnType<typeof site.world>;

/** A world's pinned actions in its chat's bar: its pills and the cards they open, each drawn as the chunk comes. */
export const pinnedBar = ({ actions, slug }: World, universe: Universe) => {
  if (actions === undefined) return undefined;
  const part = (which: "pills" | "cards") => (
    <Suspense fallback={null}>
      <PinnedBar part={which} actions={actions} universe={universe} at={slug} />
    </Suspense>
  );
  return { pills: part("pills"), cards: part("cards") };
};

/** The proposals of a world with a realm, and the calls its team pins, under its actions. */
export function Proposed({
  world,
  realmPath,
  universe,
  onRing,
}: {
  world: World;
  realmPath: string | undefined;
  universe: Universe;
  onRing: (ring: Ring | undefined) => void;
}) {
  if (realmPath === undefined) return null;
  const pinned = world.actions === undefined ? {} : { pinned: { actions: world.actions, universe } };
  return (
    <Suspense fallback={null}>
      <Proposals path={realmPath} onRing={onRing} {...pinned} />
    </Suspense>
  );
}

// A realm that can take a vote: the file's functions name one that votes and one that proposes. A realm that does not is not asked.
const takesVotes = (functions: readonly string[]) =>
  functions.some((name) => /vote/i.test(name)) && functions.some((name) => /propos/i.test(name));

/** A realm's open proposal as a pill, and its ring for the planet, for a realm whose functions say it takes votes (none asked of any other). */
export function Voted({
  path,
  functions,
  onRing,
}: {
  path: string;
  functions: readonly string[];
  onRing: (ring: Ring | undefined) => void;
}) {
  if (!takesVotes(functions)) return null;
  return (
    <Suspense fallback={null}>
      <Status path={path} onRing={onRing} />
    </Suspense>
  );
}
