// A universe's Earth, its general chat's plate (frames 37 to 42): where people speak from, who is talking, the activity, "Say hi in #general",
// the latest on X and the links out; /earth for the default universe, /net/<id>/earth for each.
import { EARTH as EARTH_ID, stampKey } from "@gnoworld/core";
import { Breadcrumb, ComingSoon, Panel, Stack } from "@gnoworld/ui";
import { type MetaArgs, useLoaderData, useNavigate } from "react-router";
import { Chat, chatPlace, EARTH_CHAT as EARTH, EARTH_KICKER, LOADING } from "../features/chat/index.ts";
import { isMissing, PlaceError } from "../features/errors/index.ts";
import { Actions } from "../features/world/Actions.tsx";
import { Activity } from "../features/world/Activity.tsx";
import { Here } from "../features/world/Here.tsx";
import { LatestOnX } from "../features/home/LatestOnX.tsx";
import { OutLinks } from "../features/realms/OutLinks.tsx";
import { RealmsToday } from "../features/world/RealmsToday.tsx";
import { useEarthChain } from "../features/world/useEarthChain.ts";
import { useHours } from "../features/world/useHours.ts";
import { DOCS, explorerLink } from "../lib/chain/explorer.ts";
import { Arrival } from "../features/passport/Later.tsx";
import { useEntered, useSpace } from "../features/universe/index.ts";
import { earthMeta, failedPageMeta, missingUniverseMeta } from "../meta.ts";
import { pageOf, site, type UniverseView } from "../places.ts";
import { useApp, useAppStore } from "../storeContext.tsx";
import { useLateRead } from "../lateRead.ts";
import universes from "../../data/universes.json" with { type: "json" };
import styles from "./earth.module.css";
import place from "./globe.module.css";
import plate from "./world.module.css";

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

// Who is talking and from how many countries, which are the relay's, whose rooms are the default universe's (8i); the realms deployed in
// 24 h beside, slice 9's (the indexer's events), greyed until the stream has told a count.
// The people's read is the home's own (8i), in its chunk.
const readPeople = (_: string, signal: AbortSignal) =>
  import("../features/home/people.ts").then((people) => people.readPeople({ signal }));

function Talking({ universe }: { universe: UniverseView }) {
  const count = useApp((app) => app.realmsDeployed[universe.id]);
  const countries = useLateRead(universe.isDefault ? "people" : undefined, readPeople)?.countries ?? 0;
  return (
    <div className={styles["talking"]}>
      <Here
        unit="talking"
        caption={countries > 0 ? `right now · ${String(countries)} countries` : "right now"}
        beside={
          count === undefined ? (
            <ComingSoon name="Realms deployed in 24 h">
              <span className={styles["soon"]}>
                realms <br />
                <span className="label nowrap">deployed in 24 h</span>
              </span>
            </ComingSoon>
          ) : (
            <RealmsToday count={count} />
          )
        }
      />
    </div>
  );
}

// Frame 40's three links out: the universe's gnoweb, its explorer and the docs.
function EarthLinks({ universe }: { universe: string }) {
  const chain = universes.find((each) => each.id === universe);
  return (
    <OutLinks
      links={[
        { label: "View on gnoweb", href: chain?.gnoweb },
        { label: "Explorer", href: chain === undefined ? undefined : explorerLink(chain.chainId) },
        { label: "Docs", href: DOCS },
      ]}
    />
  );
}

export default function Earth() {
  const universe = useLoaderData<typeof loader>();
  const store = useAppStore();
  const navigate = useNavigate();
  // The Earth is a place entered: its "Start here" and the first visit's calls go (ADR-0003 §4).
  useEntered();
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
  const hours = useHours(EARTH.slug);
  useEarthChain();
  return (
    <>
      {/* The globe's place: the page lays it out, the scene draws in it, and the universe says how far it came. */}
      <div
        className={`${String(place["globe"])} ${String(styles["earth"])}`}
        data-globe
        data-earth="waiting"
        data-flown="landed"
      />
      <Panel.Layout
        plate={
          <Panel label="Earth" look="plate" caption="gnoworld · hub atlas">
            <Panel.Body>
              <Stack>
                <Breadcrumb
                  label="You are here"
                  items={[{ label: "Universe", href: universe.home.path }, { label: "Home · the general chat" }]}
                />
                <h1>Earth</h1>
                <p>{EARTH.description}</p>
                <Talking universe={universe} />
                <Activity hours={hours} />
                {/* Frame 40: the Earth's plate says hi in its general room, and follows and shares as a world's does. */}
                <div className={plate["actions"]}>
                  <Actions
                    place={{ name: "Earth", path: universe.earth.canonical }}
                    follow={stampKey(universe.id, EARTH_ID)}
                    say="Say hi in #general"
                    room="#earth"
                  />
                </div>
                <LatestOnX />
                <EarthLinks universe={universe.id} />
              </Stack>
            </Panel.Body>
          </Panel>
        }
      >
        <div id="chat" className={styles["chat"]}>
          {chatDue ? <Chat world={EARTH.slug} place={chatPlace(EARTH, universe, EARTH_KICKER)} /> : LOADING}
        </div>
      </Panel.Layout>
      <Arrival universe={universe.id} world={EARTH_ID} name="Earth" path={universe.earth.path} />
    </>
  );
}

export function ErrorBoundary() {
  return <PlaceError what="universe" />;
}
