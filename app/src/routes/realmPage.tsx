// A realm's page, built as a world's (D375, frames 26 and 93): the same frame (placeFrame.tsx) and the same chat, with the realm's own
// planet, which the cosmos draws for the realm's world and the flight flew to (D362). The plate holds the realm's crumbs, short name,
// figures, actions, page, functions, next stops and card; the dock is the world's chat, given the realm's place.
import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { useLocation } from "react-router";
import { hubWorldOf, isAddress, realmName, realmRoom, stampKey, worldIdOf } from "@gnoworld/core";
import { shortAddress } from "@gnoworld/schemas";
import { pageRoomsApi } from "../lib/api/rooms.ts";
import { Kicker, Skeleton } from "@gnoworld/ui";
import { chatPlace, LOADING, PlaceChat, roomIds, roomsChanged } from "../features/chat/index.ts";
import { useEntered, useSpace } from "../features/universe/index.ts";
import { WorldSigns } from "../features/universe/WorldSigns.tsx";
import { Actions, Activity, StandingBox, type Ring } from "../features/world/index.ts";
import { useHours } from "../features/world/useHours.ts";
import { Voted } from "../features/world/PlateRealm.tsx";
import type { RealmAt } from "../realmAt.ts";
import { site, universePrefix } from "../places.ts";
import { useWorldsFile } from "../worldsFile.ts";
import { PlaceFrame } from "./placeFrame.tsx";
import { ByLine } from "./realmFigures.tsx";
import styles from "./world.module.css";

// The page's parts come in chunks once the plate has drawn: the first screen holds the frame and the title.
const RealmView = lazy(() =>
  import("../features/realms/RealmView.tsx").then((chunk) => ({ default: chunk.RealmView })),
);
const NextStops = lazy(() => import("../features/realms/NextStops.tsx"));
const FromExplorer = lazy(() => import("../features/realms/FromExplorer.tsx"));
const RealmStanding = lazy(() => import("../features/realms/RealmStanding.tsx"));
const LastCalls = lazy(() => import("../features/realms/LastCalls.tsx"));
const Linked = lazy(() => import("../features/world/Linked.tsx"));

// The realm's room, asked of the server once when the world's list lacks it (D390, D392): true once its world lists it, or the ask
// failed, when the chat says the room is not there. The server's bot opens a room made a moment after it answers, so the list is asked
// again till it holds the room, then the lists on the page are told (gnodice's "opens soon", 2026-11-08).
const LISTED_TRIES = 10;
const LISTED_STEP_MS = 400;

// Asks the room of `realm` when `world` does not list it, then asks the list again till it does, a few times.
async function roomListed(
  { realm, world, room }: { realm: string; world: string; room: string },
  alive: () => boolean,
) {
  const api = pageRoomsApi();
  for (let tries = 0; tries < LISTED_TRIES && alive(); tries += 1) {
    const listed = await api.rooms(world);
    if (listed.ok && roomIds(listed.value.sections).includes(room)) return;
    if (tries === 0 && !(await api.realm(realm)).ok) return;
    await new Promise((resolve) => setTimeout(resolve, LISTED_STEP_MS));
  }
}

function useRoomMade(realm: string, world: string, room: string): boolean {
  const [done, setDone] = useState<string>();
  useEffect(() => {
    let live = true;
    roomListed({ realm, world, room }, () => live)
      .then(() => {
        if (!live) return;
        roomsChanged();
        setDone(room);
      })
      .catch(reportError);
    return () => {
      live = false;
    };
  }, [realm, world, room]);
  return done === room;
}

// The planet the realm's world stands as, and the figures that stand beside the plate's title.
function useRealmBody({ realm, chain }: RealmAt, name: string) {
  const { pathname } = useLocation();
  const universe = site.universeAt(pathname);
  const room = universe.worlds.find((hub) => hubWorldOf(hub) === worldIdOf(realm))?.slug;
  const chatDue = useSpace({ world: worldIdOf(realm), name });
  return { chatDue, universe, pathname, chain, room };
}

// The realm's chat: its room, made on the first open (useRoomMade), in its world (D389 to D392). The same element docks beside the
// page or stands alone, full (full.ts).
function useRealmChat({ realm, chain }: RealmAt) {
  const universe = site.universeAt(useLocation().pathname);
  const { namespace: owner, name } = realmName(realm);
  // A namespace that is an address reads short.
  const namespace = isAddress(owner) ? shortAddress(owner) : owner;
  const where = realmRoom(realm, universe.worlds);
  const made = useRoomMade(realm, where.world, where.room);
  const place = chatPlace(
    { slug: where.world, name, description: `A realm of @${namespace} on ${chain.name}.`, inPage: true, realm },
    universe,
    `@${namespace} · ${name}`,
  );
  const chat = made ? { world: where.world, room: where.room.split("/")[1], place } : undefined;
  return { namespace, name, talk: where.world, room: where.room, chat };
}

export function RealmPage(found: RealmAt) {
  const { namespace, name, talk, room, chat } = useRealmChat(found);
  return (
    <PlaceChat
      chat={chat}
      page={(dock) => (
        <RealmPlace found={found} namespace={namespace} name={name} talk={talk} room={room} chat={dock} />
      )}
    />
  );
}

function RealmPlace({
  found,
  namespace,
  name,
  talk,
  room,
  chat,
}: {
  found: RealmAt;
  namespace: string;
  name: string;
  /** The world its room talks in (realmRoom), whose hours its activity draws. */
  talk: string;
  /** The realm's room, whose words are bubbles on its planet. */
  room: string;
  chat: ReactNode;
}) {
  const { realm, chain } = found;
  useEntered();
  // The open proposal's ring round the planet, when the realm takes votes (Voted, StatusRing.tsx).
  const [ring, setRing] = useState<Ring>();
  const { chatDue, universe, pathname } = useRealmBody(found, name);
  const worlds = useWorldsFile(true);
  const held = worlds?.flatMap((world) => world.realms).find((each) => each.path === realm);
  const prefix = universePrefix(universe);
  const hours = useHours(talk);
  // The one thing to do here follows the state (D530): a realm nobody called is for trying, one that lives is for reading.
  const untried = held?.calls === 0;
  const lead = untried ? { label: "Try its functions", href: "#functions" } : { label: "Read its page", href: "#page" };
  return (
    <>
      <PlaceFrame
        ring={ring}
        label={name}
        plate={
          <>
            <Kicker dot="world">@{namespace}</Kicker>
            <h1 id="realm-title">{name}</h1>
            <ByLine namespace={namespace} realm={realm} worlds={worlds} prefix={prefix} held={held} />
            <Actions place={{ name, path: pathname }} follow={stampKey(universe.id, worldIdOf(realm))} lead={lead} />
            {/* The standing's box is the plate's own element, so the arrival rises it as its figures come (D534). */}
            <StandingBox>
              <Suspense fallback={null}>
                <RealmStanding talk={talk} held={held} realm={realm} indexer={chain.indexer} />
              </Suspense>
            </StandingBox>
            <Voted path={pathname} functions={held?.functions ?? []} onRing={setRing} />
            <Activity hours={hours} />
            <Suspense fallback={<Skeleton lines={4} />}>
              <RealmView
                functionsFirst={untried}
                realm={realm}
                chain={chain}
                between={
                  <>
                    <Suspense fallback={null}>
                      <LastCalls realm={realm} indexer={chain.indexer} worlds={worlds} />
                    </Suspense>
                    <Suspense fallback={null}>
                      <FromExplorer view={pathname} worlds={worlds} />
                    </Suspense>
                  </>
                }
              />
            </Suspense>
            {worlds === undefined || worlds.length === 0 ? null : (
              <Suspense fallback={null}>
                <Linked id={worldIdOf(realm)} worlds={worlds} hubs={universe.worlds} prefix={prefix} />
              </Suspense>
            )}
            <Suspense fallback={null}>
              <NextStops realm={realm} worlds={worlds} prefix={prefix} />
            </Suspense>
          </>
        }
      >
        <div id="chat" className={styles["chat"]}>
          {chatDue ? chat : LOADING}
        </div>
      </PlaceFrame>
      <WorldSigns world={worldIdOf(found.realm)} room={room} />
    </>
  );
}
