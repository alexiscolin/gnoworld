// A world's page: pre-rendered for each known world, at its path and at its canonical address; any other path gets this
// route's not-found. The world is found by the request's path as written: its case is part of the address (F376).
import { lazy, Suspense, useState } from "react";
import { useLoaderData, useNavigate, useRouteError, useSearchParams, type MetaArgs } from "react-router";
import { REALM_PREFIX } from "@gnoworld/core";
import { Kicker, Panel, Stack } from "@gnoworld/ui";
import { failedWorldMeta, ORIGIN, worldMeta } from "../meta.ts";
import { chatPlace, pageOf, site } from "../places.ts";
import { Chat, LOADING } from "../features/chat/index.ts";
import { isMissing, PageError } from "../features/errors/index.ts";
import { useSpace } from "../features/universe/index.ts";
import { Actions, Activity, Here, hubWorldOf, type Ring } from "../features/world/index.ts";
import { useAppStore } from "../storeContext.tsx";
import place from "./globe.module.css";
import styles from "./world.module.css";

// A world with a realm reads its proposals in a chunk of its own, after the page has hydrated: no other world pays for it.
const Proposals = lazy(() => import("../features/world/Proposals.tsx"));

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

// What the world's planet in space needs of the page: its store and router for the moons, the room it shows, and its realm's ring.
function useWorldSpace(world: ReturnType<typeof site.world>, universe: string, ring: Ring | undefined) {
  const store = useAppStore();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const page = {
    store,
    open: (href: string) => {
      Promise.resolve(navigate(href, { preventScrollReset: true })).catch(reportError);
    },
    universe,
    slug: world.slug,
    path: world.path,
    room: params.get("room"),
    ring,
  };
  // The chat comes once the door to space has: this page holds both, and the first screen's budget carries the door (budgets.spec.ts).
  return useSpace({ world: hubWorldOf(world) }, page);
}

export default function World() {
  const world = useLoaderData<typeof loader>();
  const universe = site.home(world);
  const [ring, setRing] = useState<Ring>();
  const chatDue = useWorldSpace(world, universe.id, ring);
  const realm = world.realms?.[0];
  const realmPath =
    realm === undefined
      ? undefined
      : `${universe.isDefault ? "" : `/net/${universe.id}`}/r/${realm.slice(REALM_PREFIX.length)}`;
  // The plate comes first in the page and the chat follows, so from 900 px the page reads and tabs as it is drawn; under 900 px
  // the chat is drawn above the plate (DESIGN-SYSTEM.md, Breakpoints: 900 px, chat first), and from 1728 px the plate stands fixed
  // at the left (Panel.Layout).
  return (
    <>
      {/* The planet's place: the page lays it out, the scene draws in it (frames 22, 93, 104). */}
      <div className={place["globe"]} data-globe data-world="waiting" />
      <Panel.Layout
        plate={
          <Panel label={world.name} look="plate" caption="gnoworld · hub atlas">
            <Panel.Body>
              <Stack>
                {/* The kind of place ("UNIVERSE > DAO") is not in the data yet: the universe alone says where this is. */}
                <Kicker>{universe.name}</Kicker>
                <h1>{world.name}</h1>
                <p>{world.description}</p>
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
                    <Proposals path={realmPath} onRing={setRing} />
                  </Suspense>
                )}
              </Stack>
            </Panel.Body>
          </Panel>
        }
      >
        <div id="chat" className={styles["chat"]}>
          {chatDue ? <Chat world={world.slug} place={chatPlace(world, universe)} /> : LOADING}
        </div>
      </Panel.Layout>
    </>
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
