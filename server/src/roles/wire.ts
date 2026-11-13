// The owners' moderation as the server wires it (part 4): the owner's right from the default universe's chain, the links' routes, and the
// right the pins ask. Without UNIVERSES_FILE no chain is read, so no owner holds a namespace.
import type { DatabaseSync } from "node:sqlite";
import type { Address } from "@gnoworld/schemas";
import type { Log } from "@gnoworld/service/log";
import { send } from "@gnoworld/service/net";
import type { Hono } from "hono";
import type { Chat } from "../chat.ts";
import type { Config } from "../config.ts";
import { cliBlock } from "../login/cliProof.ts";
import { linkRoutes, serverLinks } from "../login/linkRoutes.ts";
import type { Links } from "../login/links.ts";
import { moderationRoutes, type ModerationOptions } from "../moderation/routes.ts";
import { defaultUniverse } from "../prices/universes.ts";
import { makeMayModerate } from "./mayModerate.ts";
import { namespaceFinder } from "./namespaceOf.ts";
import { cardsRoutes, type CardRoutesOptions } from "../cards/routes.ts";
import { pinsRoutes } from "../pins/routes.ts";
import { makeOwnerReaders } from "./owners.ts";

interface Deps {
  db: DatabaseSync;
  config: Pick<Config, "universes" | "chains" | "origins" | "trustedProxy" | "pepper">;
  /** The default universe's hubs: slug and first realm's world id. */
  hubs: ReadonlyMap<string, string> | undefined;
  /** The chat's pin rule (a moderator of the room's world, the team, an Earth room's maker) and what an owner's hide and mute do. */
  chat: Pick<Chat, "staff" | "mayRead" | "pins" | "hide" | "muteKeeping" | "roomsOf"> & {
    rooms: Pick<Chat["rooms"], "maker">;
    // The link cards' flow, where they run.
    cards?: CardRoutesOptions["cards"] | undefined;
  };
  /** The team and the trusted, whom an owner never mutes. */
  spared: ModerationOptions["spared"];
  session: (token: string | undefined) => Address | undefined;
  signedAt: (token: string | undefined) => number | undefined;
  log: Log;
  /** The owner readers, the default universe's unless a test gives its own. */
  readers?: ReturnType<typeof makeOwnerReaders> | undefined;
}

type Owner = (namespace: string, visitor: string) => Promise<Address | undefined>;

// The hubs' worlds whose first realm's namespace one of the members holds, read under the visitor's own limits (a display hint).
async function worldsHeld(
  { hubs, show }: { hubs: ReadonlyMap<string, string> | undefined; show: Owner | undefined },
  members: readonly Address[],
  visitor: string,
): Promise<string[]> {
  const held = await Promise.all(
    [...(hubs ?? [])].map(async ([slug, world]) => {
      const holder = await show?.(world.split("/")[0] ?? "", visitor);
      return members.some((member) => member === holder) ? slug : undefined;
    }),
  );
  return held.filter((slug) => slug !== undefined);
}

/** The link cards' routes, with the owner-aware right to remove (the pins'), only where the cards run. */
function mountCards(
  app: Hono,
  {
    chat,
    mayModerate,
    session,
    config,
    log,
  }: Pick<Deps, "chat" | "session" | "log"> & {
    config: Pick<Config, "origins" | "trustedProxy">;
    mayModerate: ReturnType<typeof makeMayModerate>;
  },
): void {
  if (chat.cards === undefined) return;
  app.route(
    "/api/cards",
    cardsRoutes({
      cards: chat.cards,
      mayPin: (room, who, visitor) => mayModerate(who, room, visitor),
      readable: chat.mayRead,
      session,
      origins: config.origins,
      proxy: config.trustedProxy,
      log,
      now: Date.now,
    }),
  );
}

/** Mounts /api/pins, /api/cards, /api/links and /api/moderation on `app`. */
export function mountOwners(
  app: Hono,
  { db, config, hubs, chat, spared, session, signedAt, log, readers: given }: Deps,
) {
  const universe = config.universes === undefined ? undefined : defaultUniverse(config.universes);
  // Two pools over one cache: the acts a person makes and the lists a page shows each read within limits of their own.
  const readers =
    given ?? (universe === undefined ? undefined : makeOwnerReaders({ send, rpc: universe.rpc, now: Date.now }));
  const namespaceOf = namespaceFinder(db, hubs ?? new Map());
  const chainId = universe?.chainId ?? config.chains[0] ?? "";
  const links = serverLinks(db, { now: Date.now, chainId, secret: config.pepper });
  const rightsFrom = (pool: "act" | "show", identityOf: Links["identityOf"]) =>
    makeMayModerate({
      staff: chat.staff,
      maker: (room, who) => chat.rooms.maker(room) === who,
      placeOf: (room) => {
        const namespace = namespaceOf(room);
        return readers === undefined || namespace === undefined
          ? undefined
          : { namespace, owner: readers[pool].lookup };
      },
      identityOf,
    });
  const mayModerate = rightsFrom("act", links.identityOf);
  const mayShow = rightsFrom("show", links.identityOf);
  app.route(
    "/api/pins",
    pinsRoutes({
      pins: chat.pins,
      // The pins ask (room, who, visitor); the right is (who, room, visitor).
      mayPin: (room, who, visitor) => mayModerate(who, room, visitor),
      mayShow: (room, who, visitor) => mayShow(who, room, visitor),
      readable: chat.mayRead,
      session,
      origins: config.origins,
      proxy: config.trustedProxy,
      log,
      now: Date.now,
    }),
  );
  mountCards(app, { chat, mayModerate, session, config, log });
  app.route(
    "/api/links",
    linkRoutes({
      links,
      session,
      signedAt,
      // A display hint: the hubs' worlds whose first realm's namespace one of the members holds, read under the visitor's own limits.
      worldsOf: (members, visitor) => worldsHeld({ hubs, show: readers?.show }, members, visitor),
      block: cliBlock,
      chainId,
      origins: config.origins,
      proxy: config.trustedProxy,
      log,
      now: Date.now,
    }),
  );
  app.route(
    "/api/moderation",
    moderationRoutes({
      hide: chat.hide,
      mute: chat.muteKeeping,
      roomsOf: chat.roomsOf,
      spared,
      mayModerate,
      // A target is judged with no links: only the address that holds the namespace is protected, and the answer tells nothing of who is linked.
      judge: rightsFrom("act", (address) => [address]).judge,
      identityOf: links.identityOf,
      session,
      origins: config.origins,
      proxy: config.trustedProxy,
      log,
      now: Date.now,
    }),
  );
  return { links };
}
