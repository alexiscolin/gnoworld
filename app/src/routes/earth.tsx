// A universe's Earth: its worlds and its ecosystems; /earth for the default one, /net/<id>/earth for each.
import { Breadcrumb, Panel, Stack } from "@gnoworld/ui";
import { type MetaArgs, useLoaderData } from "react-router";
import { isMissing, PlaceError } from "../features/errors/index.ts";
import { PlaceLinks } from "../features/list/index.ts";
import { earthMeta, failedPageMeta, missingUniverseMeta } from "../meta.ts";
import { pageOf, site } from "../places.ts";

export function loader({ request }: { request: Request }) {
  return site.universe(pageOf(request), "earth");
}
export function clientLoader({ request }: { request: Request }) {
  return site.universe(request, "earth");
}

export function meta({ loaderData, error }: MetaArgs<typeof loader>) {
  if (loaderData) return earthMeta(loaderData);
  return isMissing(error) ? missingUniverseMeta() : failedPageMeta();
}

export default function Earth() {
  const universe = useLoaderData<typeof loader>();
  return (
    <Panel.Layout
      plate={
        <Panel label="Earth" look="plate" caption="gnoworld · hub atlas">
          <Panel.Body>
            <Stack>
              <Breadcrumb
                label="You are here"
                items={[{ label: universe.name, href: universe.home.path }, { label: "Earth" }]}
              />
              <h1>Earth</h1>
              <p>{universe.name}</p>
              <h2>Worlds</h2>
              {universe.worlds.length === 0 ? (
                <p>No world yet in {universe.name}.</p>
              ) : (
                <PlaceLinks places={universe.worlds} />
              )}
              {universe.ecosystems.length === 0 ? null : (
                <>
                  <h2>Ecosystems</h2>
                  <PlaceLinks places={universe.ecosystems} />
                </>
              )}
            </Stack>
          </Panel.Body>
        </Panel>
      }
    />
  );
}

export function ErrorBoundary() {
  return <PlaceError what="universe" />;
}
