// A world's page: pre-rendered for each known world, at its path and at its canonical address; any other path gets this
// route's not-found. The world is found by the request's path as written: its case is part of the address (F376).
import { useLoaderData, useRouteError, type MetaArgs } from "react-router";
import { Breadcrumb, Panel, Stack } from "@gnoworld/ui";
import { failedWorldMeta, worldMeta } from "../meta.ts";
import { pageOf, site } from "../places.ts";
import { Chat } from "../features/chat/index.ts";
import { isMissing, PageError } from "../features/errors/index.ts";
import styles from "./plate.module.css";

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
  return (
    <div className={styles["beside"]}>
      <div className={styles["plate"]}>
        <Panel label={world.name} look="plate" caption="gnoworld · hub atlas">
          <Panel.Body>
            <Stack>
              <Breadcrumb
                label="You are here"
                items={[
                  { label: universe.name, href: universe.home.path },
                  { label: "Earth", href: universe.earth.path },
                  { label: world.name },
                ]}
              />
              <h1>{world.name}</h1>
              <p>{world.description}</p>
            </Stack>
          </Panel.Body>
        </Panel>
      </div>
      <Chat world={world.slug} />
    </div>
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
