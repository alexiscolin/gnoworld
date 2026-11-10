// A realm's page, built as a world's (D375, frames 26 and 93): the same frame (placeFrame.tsx) and the same chat, with the realm's own
// planet, which the cosmos draws for the realm's world and the flight flew to (D362). The plate holds the realm's crumbs, short name,
// lede, actions, talk bar, figures, page, functions, around it and facts (routes/plate); the dock is the world's chat, given the realm's place.
import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { useLocation } from "react-router";
import { isAddress, realmName, realmRoom, worldIdOf } from "@gnoworld/core";
import { shortAddress } from "@gnoworld/schemas";
import { pageRoomsApi } from "../lib/api/rooms.ts";
import { Kicker, Panel } from "@gnoworld/ui";
import { chatPlace, PlaceChat, roomIds, roomsChanged } from "../features/chat/index.ts";
import { useEntered, useLoaded, useSpace } from "../features/universe/index.ts";
import { site } from "../places.ts";
import { WorldSigns } from "../features/universe/WorldSigns.tsx";
import type { Ring } from "../features/world/index.ts";
import type { RealmAt } from "../realmAt.ts";
import { PlaceFrame } from "./placeFrame.tsx";

// The plate's blocks come in a chunk once the first screen has drawn: the frame and the title.
const RealmPlate = lazy(() => import("./plate/RealmPlate.tsx"));

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
  /** The world its room talks in (realmRoom), whose people the plate counts. */
  talk: string;
  /** The realm's room, whose words are bubbles on its planet. */
  room: string;
  chat: ReactNode;
}) {
  useEntered();
  // The open proposal's ring round the planet, when the realm takes votes (Voted, StatusRing.tsx).
  const [ring, setRing] = useState<Ring>();
  const chatDue = useSpace({ world: worldIdOf(found.realm), name });
  // The plate's chunk is asked once the page has loaded, never waiting for the door to space or the chat (the shapes stand till it comes).
  const loaded = useLoaded();
  return (
    <>
      <PlaceFrame
        ring={ring}
        label={name}
        plate={
          <>
            <Kicker planet>Realm · @{namespace}</Kicker>
            <Panel.Title id="realm-title">{name}</Panel.Title>
            {/* The rest of the plate comes in a chunk once the first screen has drawn (D566): its blocks are the realm's own reads. */}
            <Suspense fallback={null}>
              {loaded && <RealmPlate found={found} name={name} talk={talk} room={room} onRing={setRing} />}
            </Suspense>
          </>
        }
        chat={chat}
        chatDue={chatDue}
      />
      <WorldSigns world={worldIdOf(found.realm)} room={room} />
    </>
  );
}
