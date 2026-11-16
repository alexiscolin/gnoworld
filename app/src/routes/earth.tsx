// A universe's Earth, its general chat's plate (frames 37 to 42): where people speak from, who is talking, the activity, "Say hi in #general",
// the latest on gno.land and the links out; /earth for the default universe, /net/<id>/earth for each.
import { EARTH as EARTH_ID } from "@gnoworld/core";
import { Kicker, Panel } from "@gnoworld/ui";
import type { ReactNode } from "react";
import { type MetaArgs, useLoaderData } from "react-router";
import { chatPlace, EARTH_CHAT as EARTH, EARTH_KICKER, PlateFrame } from "../features/chat/index.ts";
import { PlaceChat } from "../features/chat/PlaceChat.tsx";
import { chunked } from "../features/chat/Failing.tsx";
import { DOCKED } from "../features/chat/useMedia.ts";
import { ErrorView, errorKind, isMissing, RouteError } from "../features/errors/index.ts";
import { Arrival } from "../features/passport/Later.tsx";
import { useEntered, useLoaded, useSpace } from "../features/universe/index.ts";
import { SpaceFoot } from "../features/universe/SpaceFoot.tsx";
import { WorldSigns } from "../features/universe/WorldSigns.tsx";
import { earthMeta, failedPageMeta, missingUniverseMeta } from "../meta.ts";
import { pageOf, site, type UniverseView } from "../places.ts";
import styles from "./earth.module.css";
import place from "./globe.module.css";
import { DockChat, PlaceFrame, useFraming } from "./placeFrame.tsx";

// The plate's blocks (routes/plate), in a chunk of their own, asked once the page has loaded (useLoaded), never on the first screen.
const EarthPlate = chunked(() => import("./plate/EarthPlate.tsx"), {
  waiting: null,
  failed: (error) => <ErrorView kind={errorKind(error)} size="inline" />,
});

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
  // The same plate as the page's, for the phone's "Its page" sheet of the full chat.
  // A place entered: its "Start here" and the first visit's calls go (ADR-0003 §4); the route's, so the chat alone has them too.
  useEntered();
  return (
    <>
      <PlaceChat
        chat={chat}
        plate={<EarthPlate universe={universe} />}
        page={(dock) => <EarthPage universe={universe} chat={dock} />}
      />
      <WorldSigns />
      <Arrival universe={universe.id} world={EARTH_ID} name="Earth" path={universe.earth.path} />
    </>
  );
}

function EarthPage({ universe, chat }: { universe: UniverseView; chat: ReactNode }) {
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
          <PlateFrame label="Earth">
            <Kicker planet>Home · the general chat</Kicker>
            <Panel.Title>Earth</Panel.Title>
            {loaded && <EarthPlate universe={universe} />}
          </PlateFrame>
        }
      >
        <DockChat className={styles["chat"]} due={chatDue}>
          {chat}
        </DockChat>
      </Panel.Layout>
      <SpaceFoot />
    </>
  );
}

export function ErrorBoundary() {
  // Inside the plate, as the Earth's page and every place's page are: never loose over the globe.
  return <PlaceFrame label="Earth" plate={<RouteError noun="universe" size="place" />} />;
}
