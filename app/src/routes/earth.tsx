// A universe's Earth, its general chat's plate (frames 37 to 42): where people speak from, who is talking, the activity, "Say hi in #general",
// the latest on X and the links out; /earth for the default universe, /net/<id>/earth for each.
import { EARTH as EARTH_ID, stampKey } from "@gnoworld/core";
import { Kicker, Panel, Stack, type StatProps } from "@gnoworld/ui";
import type { ReactNode } from "react";
import { lazy, Suspense } from "react";
import { type MetaArgs, useLoaderData, useNavigate } from "react-router";
import { chatPlace, EARTH_CHAT as EARTH, EARTH_KICKER, LOADING, PlaceChat } from "../features/chat/index.ts";
import { isMissing, PlaceError } from "../features/errors/index.ts";
import { Actions } from "../features/world/Actions.tsx";
import { Activity } from "../features/world/Activity.tsx";
import { Crowd } from "../Standing.tsx";
import { LatestOnX } from "../features/home/LatestOnX.tsx";
import { OutLinks } from "../features/realms/OutLinks.tsx";
import { useEarthChain } from "../features/world/useEarthChain.ts";
import { useHours } from "../features/world/useHours.ts";
import { DOCS, explorerLink } from "../lib/chain/explorer.ts";
import { Arrival } from "../features/passport/Later.tsx";
import { useEntered, useSpace } from "../features/universe/index.ts";
import { SpaceFoot } from "../features/universe/SpaceFoot.tsx";
import { earthMeta, failedPageMeta, missingUniverseMeta } from "../meta.ts";
import { pageOf, site, type UniverseView } from "../places.ts";
import { useApp, useAppStore } from "../storeContext.tsx";
import { useLateRead } from "../lateRead.ts";
import universes from "../../data/universes.json" with { type: "json" };
import styles from "./earth.module.css";
import place from "./globe.module.css";
import { DOCKED, useFraming } from "./placeFrame.tsx";

// Who says what from where, on the globe (frames 43 to 55): their own chunk, once the page has come.
const Signs = lazy(async () => ({ default: (await import("../EarthSigns.tsx")).PageSigns }));

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

// Who is here (D374) and from how many countries, which are the relay's, whose rooms are the default universe's (8i); the realms deployed in
// 24 h beside, slice 9's (the indexer's events), left out until the stream has told a count. The Earth's standing (D530): the people the
// hero, the rest small. The people's read is the home's own (8i), in its chunk.
const readPeople = (_: string, signal: AbortSignal) =>
  import("../features/home/people.ts").then((people) => people.readPeople({ signal }));

function Talking({ universe }: { universe: UniverseView }) {
  const count = useApp((app) => app.realmsDeployed[universe.id]);
  const countries = useLateRead(universe.isDefault ? "people" : undefined, readPeople)?.countries ?? 0;
  const rest: StatProps[] = [
    ...(countries > 0
      ? [
          {
            value: countries,
            unit: countries === 1 ? "country" : "countries",
            caption: "speaking from",
            icon: "planet",
          } as const,
        ]
      : []),
    // The realms deployed in 24 h once there are some, nothing in their place while none or unknown (Alexis, 2026-11-07; frame 38).
    ...(count === undefined || count.count === 0
      ? []
      : [
          {
            value: count.count,
            unit: count.count === 1 ? "realm" : "realms",
            caption: `deployed in 24 h · block ${String(count.height)}`,
            icon: "code",
          } as const,
        ]),
  ];
  return <Crowd world={EARTH.slug} rest={rest} />;
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
  const chat = { world: EARTH.slug, place: chatPlace(EARTH, universe, EARTH_KICKER) };
  return <PlaceChat chat={chat} page={(dock) => <EarthPage universe={universe} chat={dock} />} />;
}

function EarthPage({ universe, chat }: { universe: UniverseView; chat: ReactNode }) {
  // The Earth is a place entered: its "Start here" and the first visit's calls go (ADR-0003 §4).
  useEntered();
  // The chat comes once the door to space has: this page holds both, and the first screen's budget carries the door (budgets.spec.ts).
  const chatDue = useSpace("earth");
  const framed = useFraming(DOCKED);
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
        data-framing={framed ? "imposing" : undefined}
      />
      <Panel.Layout
        plate={
          <Panel label="Earth" look="plate" caption="gnoworld · hub atlas">
            <Panel.Body>
              <Stack>
                <Kicker dot="world">Home · the general chat</Kicker>
                <h1>Earth</h1>
                <p>{EARTH.description}</p>
                {/* Frame 40: the Earth's plate says hi in its general room, and follows and shares as a world's does. */}
                <Actions
                  place={{ name: "Earth", path: universe.earth.canonical }}
                  follow={stampKey(universe.id, EARTH_ID)}
                  say="Say hi in #general"
                  room="#earth"
                />
                <Talking universe={universe} />
                <Activity hours={hours} />
                <LatestOnX />
                <EarthLinks universe={universe.id} />
              </Stack>
            </Panel.Body>
          </Panel>
        }
      >
        <div id="chat" className={styles["chat"]}>
          {chatDue ? chat : LOADING}
        </div>
      </Panel.Layout>
      <SpaceFoot />
      <EarthSigns />
      <Arrival universe={universe.id} world={EARTH_ID} name="Earth" path={universe.earth.path} />
    </>
  );
}

// The signs over the Earth, through the page's store and router.
function EarthSigns() {
  const store = useAppStore();
  const navigate = useNavigate();
  return (
    <Suspense fallback={null}>
      <Signs
        store={store}
        open={(href) => {
          Promise.resolve(navigate(href)).catch(reportError);
        }}
      />
    </Suspense>
  );
}

export function ErrorBoundary() {
  return <PlaceError what="universe" />;
}
