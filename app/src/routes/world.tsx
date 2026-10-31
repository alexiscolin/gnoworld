// A world's page: pre-rendered for each known world, at its path and at its canonical address; any other path gets this
// route's not-found. The world is found by the request's path as written: its case is part of the address (F376).
import { useLoaderData, useRouteError, type MetaArgs } from "react-router";
import { Kicker, Panel, Stack } from "@gnoworld/ui";
import { failedWorldMeta, ORIGIN, worldMeta } from "../meta.ts";
import { pageOf, site, type World as WorldPlace } from "../places.ts";
import { Chat, type ChatPlace } from "../features/chat/index.ts";
import { isMissing, PageError } from "../features/errors/index.ts";
import { Actions, Activity } from "../features/world/index.ts";
import styles from "./world.module.css";

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
  };
}

export default function World() {
  const world = useLoaderData<typeof loader>();
  const universe = site.home(world);
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
              {/* No source yet for the history: the block says so. The connected worlds have none either (Connected: a component test only). Who is here has one, the chat's members in the store, but its block costs the first screen 240 bytes more than ADR-0001's 170 KiB (budgets.spec.ts): parked for a decision (F2868). */}
              <Activity />
              <Actions address={ORIGIN + world.canonical} />
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
