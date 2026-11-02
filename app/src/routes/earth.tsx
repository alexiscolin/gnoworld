// A universe's Earth: its worlds and its ecosystems; /earth for the default one, /net/<id>/earth for each.
import { Breadcrumb, Panel, Stack } from "@gnoworld/ui";
import { type MetaArgs, useLoaderData, useNavigate } from "react-router";
import { Chat, LOADING } from "../features/chat/index.ts";
import { isMissing, PlaceError } from "../features/errors/index.ts";
import { Connected } from "../features/world/Connected.tsx";
import { PlaceLinks } from "../features/list/index.ts";
import { useSpace } from "../features/universe/index.ts";
import { earthMeta, failedPageMeta, missingUniverseMeta } from "../meta.ts";
import { chatPlace, pageOf, site } from "../places.ts";
import { useAppStore } from "../storeContext.tsx";
import styles from "./earth.module.css";
import place from "./globe.module.css";

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

// The general chat, one for every universe: the Earth stays one place (ADR-0002 §10).
const EARTH = {
  slug: "earth",
  name: "Earth",
  description: "Where people speak from. Countries are opt-in.",
  inPage: true,
};

export default function Earth() {
  const universe = useLoaderData<typeof loader>();
  const store = useAppStore();
  const navigate = useNavigate();
  const page = {
    store,
    open: (href: string) => {
      // Under the dock's breakpoint the chat lies below the globe: a room that changes out of sight says nothing.
      Promise.resolve(navigate(href, { preventScrollReset: true }))
        .then(() => {
          document.getElementById("chat")?.scrollIntoView();
        })
        .catch(reportError);
    },
  };
  // The chat comes once the door to space has: this page holds both, and the first screen's budget carries the door (budgets.spec.ts).
  const chatDue = useSpace("earth", page);
  return (
    <>
      {/* The globe's place: the page lays it out, the scene draws in it, and the universe says how far it came. */}
      <div className={`${String(place["globe"])} ${String(styles["earth"])}`} data-globe data-earth="waiting" />
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
                {universe.worlds.length === 0 ? (
                  <>
                    <h2>Worlds</h2>
                    <p>No world yet in {universe.name}.</p>
                  </>
                ) : (
                  <Connected
                    heading="Worlds"
                    worlds={universe.worlds.map(({ name, path, description }) => ({ name, path, line: description }))}
                  />
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
      >
        <div id="chat" className={styles["chat"]}>
          {chatDue ? <Chat world={EARTH.slug} place={chatPlace(EARTH, universe, "Earth · General chat")} /> : LOADING}
        </div>
      </Panel.Layout>
    </>
  );
}

export function ErrorBoundary() {
  return <PlaceError what="universe" />;
}
