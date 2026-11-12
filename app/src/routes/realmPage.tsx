// A realm's page, built as a world's (D375, frames 26 and 93): the same frame (placeFrame.tsx) and the same chat, with the realm's own
// planet, which the cosmos draws for the realm's world and the flight flew to (D362). The plate holds the realm's crumbs, short name,
// lede, actions, talk bar, figures, page, functions, around it and facts (routes/plate); the dock is the world's chat, given the realm's place.
import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router";
import { isAddress, realmName, realmRoom, worldIdOf } from "@gnoworld/core";
import { shortAddress } from "@gnoworld/schemas";
import { pageRoomsApi } from "../lib/api/rooms.ts";
import { Kicker, Panel } from "@gnoworld/ui";
import { ErrorView, useWhere } from "../features/errors/index.ts";
import { chatPlace, PlaceChat, roomIds, roomsChanged } from "../features/chat/index.ts";
import { useEntered, useLoaded, useSpace } from "../features/universe/index.ts";
import { placeOf, site } from "../places.ts";
import { WorldSigns } from "../features/universe/WorldSigns.tsx";
import type { Ring } from "../features/world/index.ts";
import type { RealmAt } from "../realmAt.ts";
import { PlaceFrame } from "./placeFrame.tsx";

// The plate's blocks come in a chunk once the first screen has drawn: the frame and the title.
const RealmPlate = lazy(() => import("./plate/RealmPlate.tsx"));

// The realm's room, asked of the server once when the world's list lacks it (D390, D392). The server's bot opens a room made a moment
// after it answers, so the list is asked again till it holds the room, then the lists on the page are told (gnodice's "opens soon").
// A refused ask, or a room still missing after the tries, is "failed": the dock says so and offers another go, never an empty column.
const LISTED_TRIES = 10;
const LISTED_STEP_MS = 400;

type Made = "making" | "made" | "failed";

/** Asks the room of `realm` when `world` does not list it, then asks the list again till it does, a few times. */
export async function roomListed(
  { realm, world, room }: { realm: string; world: string; room: string },
  alive: () => boolean,
  api: Pick<ReturnType<typeof pageRoomsApi>, "rooms" | "realm"> = pageRoomsApi(),
): Promise<boolean> {
  for (let tries = 0; tries < LISTED_TRIES && alive(); tries += 1) {
    const listed = await api.rooms(world);
    if (listed.ok && roomIds(listed.value.sections).includes(room)) return true;
    if (tries === 0 && !(await api.realm(realm)).ok) return false;
    await new Promise((resolve) => setTimeout(resolve, LISTED_STEP_MS));
  }
  return false;
}

function useRoomMade({ realm, world, room }: { realm: string; world: string; room: string }, known: boolean) {
  const [done, setDone] = useState<{ room: string; made: Made }>();
  const [again, setAgain] = useState(0);
  useEffect(() => {
    if (!known) return;
    let live = true;
    roomListed({ realm, world, room }, () => live)
      .then((listed) => {
        if (!live) return;
        roomsChanged();
        setDone({ room, made: listed ? "made" : "failed" });
      })
      .catch((error: unknown) => {
        reportError(error);
        if (live) setDone({ room, made: "failed" });
      });
    return () => {
      live = false;
    };
  }, [realm, world, room, again, known]);
  const made: Made = done?.room === room ? done.made : "making";
  return {
    made,
    retry: () => {
      setDone(undefined);
      setAgain((n) => n + 1);
    },
  };
}

// The realm's chat: its room, made on the first open (useRoomMade), in its world (D389 to D392). The same element docks beside the
// page or stands alone, full (full.ts).
function useRealmChat({ realm, chain }: RealmAt, known: boolean) {
  const universe = site.universeAt(useLocation().pathname);
  const { namespace: owner, name } = realmName(realm);
  // A namespace that is an address reads short.
  const namespace = isAddress(owner) ? shortAddress(owner) : owner;
  const where = realmRoom(realm, universe.worlds);
  const { made, retry } = useRoomMade({ realm, world: where.world, room: where.room }, known);
  const place = chatPlace(
    {
      slug: where.world,
      name,
      description: `A realm of @${namespace} on ${chain.name}.`,
      inPage: true,
      realm,
      room: where.room,
    },
    universe,
    `@${namespace} · ${name}`,
  );
  const chat = made === "made" ? { world: where.world, room: where.room.split("/")[1], place } : undefined;
  return { namespace, name, talk: where.world, room: where.room, chat, failed: made === "failed", retry };
}

// The owner's namespace as the kicker shows it: a link to its system's page when the universe lists one.
function OwnerLink({ realm, namespace }: { realm: string; namespace: string }) {
  const owner = realmName(realm).namespace;
  const href = placeOf(site.universeAt(useLocation().pathname), owner)?.href;
  return href === undefined ? <>@{namespace}</> : <Link to={href}>@{namespace}</Link>;
}

/** A realm's page; `known` is whether its realm is proved to exist: no room is asked and no planet drawn before. */
export function RealmPage({ found, known }: { found: RealmAt; known: boolean }) {
  const { namespace, name, talk, room, chat, failed, retry } = useRealmChat(found, known);
  const at = useWhere();
  return (
    <PlaceChat
      chat={chat}
      page={(dock) => (
        <RealmPlace
          found={found}
          namespace={namespace}
          name={name}
          talk={talk}
          room={room}
          chat={failed ? <ErrorView kind="unavailable" size="inline" where={at} onRetry={retry} /> : dock}
          failed={failed}
          known={known}
        />
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
  failed,
  known,
}: {
  found: RealmAt;
  namespace: string;
  name: string;
  /** The world its room talks in (realmRoom), whose people the plate counts. */
  talk: string;
  /** The realm's room, whose words are bubbles on its planet. */
  room: string;
  chat: ReactNode;
  /** The realm's room could not be made: the dock says so at once, not waiting for the door to space. */
  failed: boolean;
  known: boolean;
}) {
  useEntered();
  // The open proposal's ring round the planet, when the realm takes votes (Voted, StatusRing.tsx).
  const [ring, setRing] = useState<Ring>();
  const chatDue = useSpace(known ? { world: worldIdOf(found.realm), name } : undefined);
  // The plate's chunk is asked once the page has loaded, never waiting for the door to space or the chat (the shapes stand till it comes).
  const loaded = useLoaded();
  return (
    <>
      <PlaceFrame
        ring={ring}
        label={name}
        plate={
          <>
            <Kicker planet>
              Realm · <OwnerLink realm={found.realm} namespace={namespace} />
            </Kicker>
            <Panel.Title id="realm-title">{name}</Panel.Title>
            {/* The rest of the plate comes in a chunk once the first screen has drawn (D566): its blocks are the realm's own reads. */}
            <Suspense fallback={null}>
              {loaded && <RealmPlate found={found} name={name} talk={talk} room={room} onRing={setRing} />}
            </Suspense>
          </>
        }
        chat={chat}
        chatDue={chatDue || failed}
      />
      <WorldSigns world={worldIdOf(found.realm)} />
    </>
  );
}
