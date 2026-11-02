// A world's page: pre-rendered for each known world, at its path and at its canonical address; any other path gets this
// route's not-found. The world is found by the request's path as written: its case is part of the address (F376).
import { lazy, Suspense } from "react";
import { useLoaderData, useRouteError, type MetaArgs } from "react-router";
import { REALM_PREFIX } from "@gnoworld/core";
import { Kicker, Panel, Stack } from "@gnoworld/ui";
import { failedWorldMeta, ORIGIN, worldMeta } from "../meta.ts";
import { chatPlace, pageOf, site } from "../places.ts";
import { Chat } from "../features/chat/index.ts";
import { isMissing, PageError } from "../features/errors/index.ts";
import { Actions, Activity, Here } from "../features/world/index.ts";
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

export default function World() {
  const world = useLoaderData<typeof loader>();
  const universe = site.home(world);
  const realm = world.realms?.[0];
  const realmPath =
    realm === undefined
      ? undefined
      : `${universe.isDefault ? "" : `/net/${universe.id}`}/r/${realm.slice(REALM_PREFIX.length)}`;
  // The plate comes first in the page and the chat follows, so from 900 px the page reads and tabs as it is drawn; under 900 px
  // the chat is drawn above the plate (DESIGN-SYSTEM.md, Breakpoints: 900 px, chat first), and from 1728 px the plate stands fixed
  // at the left (Panel.Layout).
  return (
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
                  <Proposals path={realmPath} />
                </Suspense>
              )}
            </Stack>
          </Panel.Body>
        </Panel>
      }
    >
      <div id="chat" className={styles["chat"]}>
        <Chat world={world.slug} place={chatPlace(world, universe)} />
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
