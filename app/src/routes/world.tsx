// A world's page: pre-rendered for each known world, at its path and at its canonical address; any other path gets this
// route's not-found. The world is found by the request's path as written: its case is part of the address (F376).
import { lazy, Suspense } from "react";
import { useLoaderData, useRouteError, type MetaArgs } from "react-router";
import { Kicker, Panel, Stack } from "@gnoworld/ui";
import { failedWorldMeta, ORIGIN, worldMeta } from "../meta.ts";
import { realmViewOf } from "../pinned.ts";
import { pageOf, site, type World as WorldPlace } from "../places.ts";
import { Chat, type ChatPlace, type Pinned as ChatPinned } from "../features/chat/index.ts";
import { isMissing, PageError } from "../features/errors/index.ts";
import { Actions, Activity, Arrival, FirstCharted, Here } from "../features/world/index.ts";
import styles from "./world.module.css";

// A world with a realm reads its proposals in a chunk of its own, after the page has hydrated: no other world pays for it.
const Proposals = lazy(() => import("../features/world/Proposals.tsx"));
// A world's pinned actions (D271) are drawn on the plate by the proposals' chunk and in the chat's bar from a chunk this route hands the
// chat (the chat reaches no realm code of its own); one that cannot be fetched leaves the bar alone (F1763).
const none = () => ({ default: () => null });
const pinned = () => import("../features/world/Pinned.tsx");
const PINNED_BAR: Pick<ChatPinned, "Pills" | "Cards"> = {
  Pills: lazy<ChatPinned["Pills"]>(() => pinned().then((chunk) => ({ default: chunk.Pills }), none)),
  Cards: lazy<ChatPinned["Cards"]>(() => pinned().then((chunk) => ({ default: chunk.Cards }), none)),
};

export function loader({ request }: { request: Request }) {
  return site.world(pageOf(request));
}

// The list ships with the client, so the browser fetches no world: an unknown path is a 404 here, not a request the
// static host answers with its fallback page. React Router 8.4.0 drops `caseSensitive` on the client: `site.world`
// reads the path itself.
export function clientLoader({ request }: { request: Request }) {
  return site.world(request);
}

export function meta({ loaderData, error }: MetaArgs<typeof loader>) {
  return loaderData || isMissing(error) ? worldMeta(loaderData) : failedWorldMeta();
}

// What the chat's header, its column of worlds and its info panel say of the place.
function placeOf(world: WorldPlace, universe: ReturnType<typeof site.home>): ChatPlace {
  return {
    slug: world.slug,
    name: world.name,
    description: world.description,
    kicker: `${universe.name} · ${world.name}`,
    home: universe.home.path,
    worlds: universe.worlds.map(({ slug, name, path }) => ({ slug, name, href: path })),
    ...(world.actions === undefined ? {} : { pinned: { actions: world.actions, universe, ...PINNED_BAR } }),
  };
}

export default function World() {
  const world = useLoaderData<typeof loader>();
  const universe = site.home(world);
  const realm = world.realms?.[0];
  const realmPath = realm === undefined ? undefined : realmViewOf(universe, realm);
  // The plate comes first in the page and the chat follows, so from 900 px the page reads and tabs as it is drawn; under 900 px
  // the chat is drawn above the plate (DESIGN-SYSTEM.md, Breakpoints: 900 px, chat first), and from 1728 px the plate stands fixed
  // at the left (Panel.Layout).
  return (
    <Panel.Layout
      plate={
        <Panel label={world.name} look="plate" caption="gnoworld · hub atlas">
          <Panel.Body>
            <Stack>
              {/* The arrival banners (9h): nothing unless the server's signal says this account earned one. */}
              <Arrival world={world.slug} name={world.name} address={ORIGIN + world.canonical} />
              {/* The kind of place ("UNIVERSE > DAO") is not in the data yet: the universe alone says where this is. */}
              <Kicker>{universe.name}</Kicker>
              <h1>{world.name}</h1>
              <p>
                {world.description}
                <FirstCharted world={world.slug} />
              </p>
              {/* Who is here comes from the chat once it has connected; no source gives the rate, nor a link to another world (Connected: a component test only). */}
              <Here />
              {/* No source yet for the history: the block says so. */}
              <Activity />
              <Actions
                address={ORIGIN + world.canonical}
                {...(realmPath === undefined ? {} : { proposals: realmPath })}
              />
              {realmPath === undefined ? null : (
                <Suspense fallback={null}>
                  <Proposals
                    path={realmPath}
                    {...(world.actions === undefined ? {} : { pinned: { actions: world.actions, universe } })}
                  />
                </Suspense>
              )}
            </Stack>
          </Panel.Body>
        </Panel>
      }
    >
      <div id="chat" className={styles["chat"]}>
        <Chat world={world.slug} place={placeOf(world, universe)} />
      </div>
    </Panel.Layout>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  const missing = isMissing(error);
  return missing ? (
    <PageError title="No world here" line="No world of gno.land goes by that name." />
  ) : (
    <PageError title="This world could not load" line="Try again in a moment." reload />
  );
}
