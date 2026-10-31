// A world's page: pre-rendered for each known world, at its path and at its canonical address; any other path gets this
// route's not-found. The world is found by the request's path as written: its case is part of the address (F376).
import { useLoaderData, useRouteError, type MetaArgs } from "react-router";
import { Kicker, Panel, Stack } from "@gnoworld/ui";
import { failedWorldMeta, ORIGIN, worldMeta } from "../meta.ts";
import { pageOf, site } from "../places.ts";
import { Chat } from "../features/chat/index.ts";
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

export default function World() {
  const world = useLoaderData<typeof loader>();
  const universe = site.home(world);
  // The chat comes first in the page, so a phone shows it first and a screen reader reads it first (DESIGN-SYSTEM.md,
  // Breakpoints: 900 px, chat first); from 900 px the plate is drawn before it, and from 1728 px it stands fixed at the left (Panel.Layout).
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
              {/* No source yet for the history: the block says so. The facts and the connected worlds have none either, so the page holds neither (Facts, Connected: component tests only). */}
              <Activity />
              <Actions address={ORIGIN + world.canonical} />
            </Stack>
          </Panel.Body>
        </Panel>
      }
    >
      <div id="chat" className={styles["chat"]}>
        <Chat world={world.slug} />
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
