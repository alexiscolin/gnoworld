// A universe's Earth, its general chat's plate (frames 37 to 42): where people speak from, who is talking, the activity, "Say hi in #general",
// the latest on X and the links out; /earth for the default universe, /net/<id>/earth for each.
import { EARTH as EARTH_ID } from "@gnoworld/core";
import { Kicker, Panel, Stack } from "@gnoworld/ui";
import type { ReactNode } from "react";
import { lazy, Suspense } from "react";
import { type MetaArgs, useLoaderData, useNavigate } from "react-router";
import { chatPlace, EARTH_CHAT as EARTH, EARTH_KICKER, PlaceChat } from "../features/chat/index.ts";
import { isMissing, PlaceError } from "../features/errors/index.ts";
import { Arrival } from "../features/passport/Later.tsx";
import { useEntered, useLoaded, useSpace } from "../features/universe/index.ts";
import { SpaceFoot } from "../features/universe/SpaceFoot.tsx";
import { earthMeta, failedPageMeta, missingUniverseMeta } from "../meta.ts";
import { pageOf, site, type UniverseView } from "../places.ts";
import { useAppStore } from "../storeContext.tsx";
import styles from "./earth.module.css";
import place from "./globe.module.css";
import { DockChat, DOCKED, useFraming } from "./placeFrame.tsx";

// The plate's blocks (routes/plate), in a chunk once the first screen has drawn, asked once the door to space has come (chatDue), never on the first screen.
const EarthPlate = lazy(() => import("./plate/EarthPlate.tsx"));

// Who says what from where, on the globe (frames 43 to 55): their own chunk, once the page has come.
// Asked as this module runs, not as the first render does: held behind the page's other chunks it fell past the first screen into the chat's count.
const earth = import("../EarthSigns.tsx");
const Signs = lazy(async () => ({ default: (await earth).PageSigns }));

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
  const chat = { world: EARTH.slug, place: chatPlace(EARTH, universe, EARTH_KICKER) };
  return <PlaceChat chat={chat} page={(dock) => <EarthPage universe={universe} chat={dock} />} />;
}

function EarthPage({ universe, chat }: { universe: UniverseView; chat: ReactNode }) {
  // The Earth is a place entered: its "Start here" and the first visit's calls go (ADR-0003 §4).
  useEntered();
  // The chat comes once the door to space has: this page holds both, and the first screen's budget carries the door (budgets.spec.ts).
  const chatDue = useSpace("earth");
  // The plate's chunk is asked once the page has loaded, never waiting for the door to space or the chat (the shapes stand till it comes).
  const loaded = useLoaded();
  const framed = useFraming(DOCKED);
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
                <Kicker planet>Home · the general chat</Kicker>
                <Panel.Title>Earth</Panel.Title>
                <Suspense fallback={null}>{loaded && <EarthPlate universe={universe} />}</Suspense>
              </Stack>
            </Panel.Body>
          </Panel>
        }
      >
        <DockChat className={styles["chat"]} due={chatDue}>
          {chat}
        </DockChat>
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
