// A world's page: pre-rendered for each known world, at its path and at its canonical address; any other path gets this
// route's not-found. The world is found by the request's path as written: its case is part of the address (F376).
import { useLoaderData, useRouteError, type MetaArgs } from "react-router";
import { Breadcrumb, Panel, Stack } from "@gnoworld/ui";
import { failedWorldMeta, worldMeta } from "../meta.ts";
import { pageOf, site, type World as WorldPlace } from "../places.ts";
import { Chat, type ChatPlace } from "../features/chat/index.ts";
import { isMissing, PageError } from "../features/errors/index.ts";

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
  return (
    <Panel.Layout
      plate={
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
      }
    >
      <Chat world={world.slug} place={placeOf(world, universe)} />
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
