// A realm's plate (slice 13, D566): the adapter that fills the model from the realm's own sources, its page, the chain's indexer and
// the worlds' file, and the plate it draws. In a chunk of its own with the page's and the indexer's code (routes/realmPage.tsx). Its calls
// and callers per day, and what it can do, come with the server's rollup and the typed reads: none stands here till they do.
import { stampKey, worldIdOf } from "@gnoworld/core";
import { shortAddress } from "@gnoworld/schemas";
import type { RealmRollup, Worlds } from "@gnoworld/schemas/indexer";
import { DOCS, explorerLink } from "../../lib/chain/explorer.ts";
import { useLateRead } from "../../lateRead.ts";
import { useHere } from "../../useHere.ts";
import { realmFigures } from "./realmFigures.ts";
import type { RealmAt } from "../../realmAt.ts";
import { universePrefix, site } from "../../places.ts";
import { useWorldsFile } from "../../worldsFile.ts";
import { useState } from "react";
import { useLocation } from "react-router";
import { useRealm } from "../../features/realms/useRealm.ts";
import { useRealmFacts } from "../../features/realms/useRealmFacts.ts";
import { Voted } from "../../features/world/PlateRealm.tsx";
import type { Ring } from "../../features/world/statusRing.ts";
import { aroundOf } from "./around.ts";
import { ago } from "./days.ts";
import { capabilitiesOf } from "./capabilities.ts";
import { grouped, statusOf } from "./figures.ts";
import type { PlateModel, Widget } from "./model.ts";
import { Plate } from "./Plate.tsx";
import { sentenceOf } from "./sentence.ts";

type Held = Worlds["worlds"][number]["realms"][number];

// The lines a square opens on: the first hundred, as every list of the plate.
const LISTED = 100;

// The rank in the worlds' file by calls, for a realm in its first ten that has been called: the file's own order, no source of its own.
const RANKED = 10;
function rankOf(realm: string, worlds: Worlds["worlds"] | undefined, chain: string): string | undefined {
  const calls = worlds?.flatMap((world) => world.realms).filter((each) => (each.calls ?? 0) > 0);
  if (calls === undefined) return undefined;
  const at = calls.sort((a, b) => (b.calls ?? 0) - (a.calls ?? 0)).findIndex((each) => each.path === realm);
  return at >= 0 && at < RANKED ? `#${String(at + 1)} by calls on ${chain.toLowerCase()}` : undefined;
}

// The realms of the file that import this one: a fact of the file, counted once a view.
const importersOf = (realm: string, worlds: Worlds["worlds"]): number =>
  worlds.flatMap((world) => world.realms).filter((each) => each.imports.includes(realm)).length;

function widgetsOf({
  held,
  first,
  importers,
}: {
  held: Held | undefined;
  first: number | undefined;
  importers: number | undefined;
}): Widget[] {
  const made: (Widget | undefined)[] = [
    held === undefined
      ? undefined
      : { label: "Functions", value: grouped(held.functions.length), more: held.functions.slice(0, LISTED) },
    held === undefined
      ? undefined
      : { label: "Imports", value: grouped(held.imports.length), more: held.imports.slice(0, LISTED) },
    importers === undefined ? undefined : { label: "Imported by", value: grouped(importers) },
    first === undefined ? undefined : { label: "Created", value: grouped(first), detail: "block" },
    held?.deployer == null ? undefined : { label: "Author", value: held.deployerName ?? shortAddress(held.deployer) },
    held?.lastHeight == null ? undefined : { label: "Last call", value: grouped(held.lastHeight), detail: "block" },
  ];
  return made.filter((widget) => widget !== undefined);
}

// The sentence of a page that was read whole; none while it comes or when it failed.
const sentenceFrom = (state: ReturnType<typeof useRealm>) =>
  state.state === "read" && state.page.kind === "page" ? sentenceOf(state.page.blocks) : undefined;

// What a realm is, in the proposal's words: people here now; else "Live" when its last call is under a day old, "Quiet" after; never called.
const DAY_MS = 86_400_000;
function statusOfRealm({
  here,
  held,
  rollup,
  now,
}: {
  here: number;
  held: Held | undefined;
  rollup: RealmRollup | undefined;
  now: number;
}) {
  if (here > 0) return statusOf(here, "");
  if (held?.calls === 0) return { label: "Never called", tone: "neutral" } as const;
  const at = Date.parse(rollup?.last[0]?.time ?? "");
  if (Number.isNaN(at)) return statusOf(here, held === undefined ? "On chain" : "In use");
  const { value, unit } = ago(at, now);
  const words = `last call ${String(value)} ${unit}`;
  return now - at < DAY_MS
    ? ({ label: `Live · ${words}`, tone: "mine" } as const)
    : ({ label: `Quiet · ${words}`, tone: "warm" } as const);
}

// The room as the chat keys it: the part after its world.
const chatRoom = (room: string) => room.split("/").at(-1) ?? room;

// Read its page leads, Try a function beside it (the proposal's two buttons); a realm nobody called leads with trying.
const PAGE_LEAD = { label: "Read its page", href: "#page", icon: "news" } as const;
const TRY_LEAD = { label: "Try a function", href: "#functions", icon: "play" } as const;
const leadOf = (held: Held | undefined) =>
  held?.calls === 0 ? { lead: TRY_LEAD, second: PAGE_LEAD } : { lead: PAGE_LEAD, second: TRY_LEAD };

// The rollup's reader and its schema come in a chunk of their own, asked as the plate runs.
const readRollup = (realm: string, signal: AbortSignal) =>
  import("../../lib/chain/rollup.ts").then((chunk) => chunk.readRollup(import.meta.env.BASE_URL, realm, { signal }));

// Everything the realm's blocks read: the worlds' file, who is here, the indexer's first block, its page and its rollup.
function useRealmReads({ realm, chain }: RealmAt, talk: string) {
  const worlds = useWorldsFile(true);
  const facts = useRealmFacts(chain.indexer, realm);
  return {
    worlds,
    held: worlds?.flatMap((world) => world.realms).find((each) => each.path === realm),
    here: useHere(true).get(talk) ?? 0,
    first: facts?.ok === true ? facts.value.firstBlock : undefined,
    state: useRealm({ rpc: chain.rpc, realm, origin: chain.gnoweb }),
    rollup: useLateRead(realm, readRollup),
  };
}

export default function RealmPlate({
  found,
  name,
  talk,
  room,
  onRing,
}: {
  found: RealmAt;
  name: string;
  /** The world its room talks in. */
  talk: string;
  /** The realm's room, as the chat keys it. */
  room: string;
  onRing: (ring: Ring | undefined) => void;
}) {
  const { realm, chain } = found;
  const { pathname } = useLocation();
  const universe = site.universeAt(pathname);
  const prefix = universePrefix(universe);
  const { worlds, held, here, first, state, rollup } = useRealmReads(found, talk);
  // The moment the plate reads its ages from, taken once.
  const [now] = useState(Date.now);
  const model: PlateModel = {
    lede: {
      sentence: sentenceFrom(state),
      status: statusOfRealm({ here, held, rollup, now }),
      rank: rankOf(realm, worlds, chain.name),
    },
    // The one thing to do here follows the state (D530): a realm nobody called is for trying, one that lives is for reading.
    actions: {
      place: { name, path: pathname },
      follow: stampKey(universe.id, worldIdOf(realm)),
      ...leadOf(held),
    },
    talk: { name, room: chatRoom(room) },
    figures: { figures: realmFigures({ held, rollup, importers: worlds && importersOf(realm, worlds), now }) },
    extras: <Voted path={pathname} functions={held?.functions ?? []} onRing={onRing} />,
    realm: { realm, chain, state, worlds, rollup },
    can: capabilitiesOf(held?.imports ?? []),
    around: aroundOf(worlds, {
      id: worldIdOf(realm),
      centre: name,
      hubs: universe.worlds,
      prefix,
      realm,
      importers: rollup?.importers,
    }),
    widgets: widgetsOf({ held, first, importers: worlds && importersOf(realm, worlds) }),
    links: [
      { label: "Explorer", href: explorerLink(chain.chainId, realm) },
      { label: "Docs", href: DOCS },
    ],
  };
  return <Plate model={model} />;
}
