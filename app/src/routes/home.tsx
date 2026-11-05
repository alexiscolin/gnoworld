// A universe's cosmos: the home for the default one (/), its own page for another (/net/<id>/).
import events from "../../data/events.json" with { type: "json" };
import news from "../../data/news.json" with { type: "json" };
import { type MetaArgs, useLoaderData } from "react-router";
import { isMissing, PlaceError } from "../features/errors/index.ts";
import { Hero, Ticker, tickerItems, useClock, withChain, Worlds } from "../features/home/index.ts";
import { PlaceLinks } from "../features/list/index.ts";
import { useEarthChain } from "../features/world/useEarthChain.ts";
import { failedPageMeta, homeMeta, missingUniverseMeta } from "../meta.ts";
import { pageOf, site } from "../places.ts";
import { useApp } from "../storeContext.tsx";

// The data ships with the client, so the browser fetches nothing: an unknown universe is a 404 here, and the path's
// case is checked (F376).
export function loader({ request }: { request: Request }) {
  return site.universe(pageOf(request), "cosmos");
}
export function clientLoader({ request }: { request: Request }) {
  return site.universe(request, "cosmos");
}

export function meta({ loaderData, error }: MetaArgs<typeof loader>) {
  if (loaderData) return homeMeta(loaderData);
  return isMissing(error) ? missingUniverseMeta() : failedPageMeta();
}

export default function Home() {
  const universe = useLoaderData<typeof loader>();
  const now = useClock();
  const deploys = useApp((app) => app.deploys);
  useEarthChain();
  return (
    <>
      <Hero universe={universe} />
      <Worlds>
        <PlaceLinks places={universe.worlds} />
      </Worlds>
      <Ticker
        items={withChain(tickerItems(news, events, now), {
          deploys,
          universe: universe.id,
          prefix: universe.isDefault ? "" : `/net/${universe.id}`,
        })}
      />
    </>
  );
}

// Every route catches its own errors (docs/ARCHITECTURE.md; F329); the app may be what failed, so the
// way home loads the document again (F325).
export function ErrorBoundary() {
  return <PlaceError what="universe" />;
}
