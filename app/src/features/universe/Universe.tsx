// The space behind the page (ADR-0001 §7): a canvas under everything, the 3D's code loaded after the text, or on request. It stays
// mounted once it came, so a page that does not show it only covers it. The places' links stay in the page, with or without the 3D.
import { PHONE_QUERY } from "@gnoworld/core";
import { Button } from "@gnoworld/ui";
import { Suspense, useEffect, useRef, useState, useSyncExternalStore, type ComponentProps } from "react";
import { Credits } from "./Credits.tsx";
import { FlightPanel } from "./FlightPanel.tsx";
import type { PageSigns } from "./EarthSigns.tsx";
import type { WorldMoons } from "./WorldMoons.tsx";
import type { EarthState } from "../../scene/earth/device.ts";
import { markCalls } from "./globe.ts";
import { lazyPart } from "./lazyPart.ts";
import { SceneHost, type CosmosPage, type EarthPage, type Shown, type WorldPage } from "./host.ts";
import { firstArrival, HomeOpening } from "./Opening.tsx";
import { whenPhone3d } from "./phone3d.ts";
import type { Rail } from "./Rail.tsx";
import { SystemCrumb } from "./SystemCrumb.tsx";
import styles from "./Universe.module.css";

// The button leaves as the scene comes: a focus it held goes to the page's heading, where the reader was. One they took elsewhere stays.
function handOver(button: HTMLElement) {
  const held = document.activeElement;
  if (held === button || held === document.body) document.querySelector("h1")?.focus({ preventScroll: true });
}

const SORRY = "Space is not available here. Every place is in the list.";
const NO_MAPS = "The Earth's maps did not come. Every place is in the list.";

// What the live region says, on a page that shows space.
function lineOf(failed: boolean, earthFailed: boolean) {
  if (failed) return SORRY;
  return earthFailed ? NO_MAPS : null;
}

// The signs on the globe, their code asked once there is a globe: none of it is the first screen's, and a chunk that does not come leaves the
// Earth as it is.
const Signs = lazyPart<ComponentProps<typeof PageSigns>>(() =>
  import("./EarthSigns.tsx").then(({ PageSigns: signs }) => signs),
);

// A world's rooms as moons, their code asked once a world stands: a chunk that does not come leaves the world without them.
const Moons = lazyPart<ComponentProps<typeof WorldMoons>>(() =>
  import("./WorldMoons.tsx").then(({ WorldMoons: moons }) => moons),
);

// What stands on a world once it is drawn: its moons' links, where the page holds a world.
function OnTheWorld({ host, page }: { host: SceneHost; page: EarthPage | WorldPage | undefined }) {
  const sky = host.sky();
  return page === undefined || !("slug" in page) || sky === undefined ? null : (
    <Suspense fallback={null}>
      <Moons page={page} sky={sky} />
    </Suspense>
  );
}

// What stands on the Earth once it is drawn.
function OnTheEarth({ host, page }: { host: SceneHost; page: EarthPage | WorldPage | undefined }) {
  const ground = host.ground();
  return (
    <>
      <Credits />
      {page === undefined || ground === undefined ? null : (
        <Suspense fallback={null}>
          <Signs page={page} ground={ground} />
        </Suspense>
      )}
    </>
  );
}

interface BesideProps {
  readonly host: SceneHost;
  readonly page: EarthPage | WorldPage | CosmosPage | undefined;
  readonly showsMaps: boolean;
  readonly earth: EarthState;
  readonly world: EarthState;
}

// The rail (7i), its code asked once the cosmos runs on a computer: a chunk that does not come leaves the page's list of worlds.
const RailPart = lazyPart<ComponentProps<typeof Rail>>(() => import("./Rail.tsx").then(({ Rail: rail }) => rail));

// The labels' doors, a chunk asked once the cosmos runs, as its labels are: none of it is the first screen's, and a chunk that does not come
// leaves the labels as words.
const loadDoors = () => import("./labelDoors.ts");

// What stands beside the cosmos: its maps' credits, its labels as doors to their worlds (ADR-0003, 2b and 2e), and on a computer the rail,
// read once as the host decides a phone.
function OnTheCosmos({ host, page }: { host: SceneHost; page: CosmosPage | undefined }) {
  const [computer] = useState(() => !matchMedia(PHONE_QUERY).matches);
  useEffect(() => {
    if (page === undefined) return undefined;
    const leaving = new AbortController();
    // A chunk that comes once the cosmos left hears nothing: its listeners take a signal already aborted.
    loadDoors().then(
      ({ labelDoors }) => {
        labelDoors(page, host.feed.data, leaving.signal);
      },
      () => undefined,
    );
    return () => {
      leaving.abort();
    };
  }, [host, page]);
  return (
    <>
      <Credits overTicker />
      {computer && page !== undefined ? (
        <Suspense fallback={null}>
          <RailPart source={host.feed} places={page.places} open={page.open} follows={page.follows} />
        </Suspense>
      ) : null}
    </>
  );
}

// What stands over the scene: the flight panel while it runs, and on the cosmos the crumb back from a system the eye rests at (7v), whatever
// the scene's state: a lost context leaves the eye at a system, and the way back with it (7v's review).
function Over({
  host,
  shown,
  running,
  flight,
}: {
  host: SceneHost;
  shown: Shown;
  running: boolean;
  flight: ReturnType<SceneHost["flown"]["flight"]>;
}) {
  return (
    <>
      {shown && running ? <FlightPanel flight={flight} /> : null}
      {shown === "cosmos" ? <SystemCrumb back={host.back} /> : null}
    </>
  );
}

// What stands with the running scene: wherever maps show, their credits.
function Beside({ host, page, showsMaps, earth, world }: BesideProps) {
  const placed = page !== undefined && "store" in page ? page : undefined;
  if (earth === "drawn") return <OnTheEarth host={host} page={placed} />;
  if (world === "drawn") return <OnTheWorld host={host} page={placed} />;
  return showsMaps ? (
    <OnTheCosmos host={host} page={page !== undefined && "places" in page ? page : undefined} />
  ) : null;
}

export function Universe({ shown, page }: { shown: Shown; page?: EarthPage | WorldPage | CosmosPage | undefined }) {
  const [host] = useState(() => new SceneHost());
  const status = useSyncExternalStore(host.subscribe, host.status);
  const earth = useSyncExternalStore(host.subscribe, host.earth);
  const world = useSyncExternalStore(host.subscribe, host.world);
  const flight = useSyncExternalStore(host.subscribe, host.flown.flight);
  const [first] = useState(firstArrival);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => (canvasRef.current === null ? undefined : host.attach(canvasRef.current)), [host]);
  useEffect(() => {
    host.show(shown, page);
    first.at(shown);
  }, [host, first, shown, page]);
  useEffect(() => {
    markCalls(status, shown);
  }, [status, shown]);
  useEffect(() => {
    if (status !== "offered") return;
    const leaving = new AbortController();
    whenPhone3d(() => {
      host.press(() => undefined);
    }, leaving.signal);
    return () => {
      leaving.abort();
    };
  }, [host, status]);
  return (
    <>
      <canvas
        ref={canvasRef}
        className={styles["canvas"]}
        aria-hidden="true"
        data-scene={shown ? status : "covered"}
        data-opened={status === "on" ? "" : undefined}
      />
      {shown && (status === "offered" || status === "asked") ? (
        <div className={styles["offer"]}>
          <Button
            busy={status === "asked"}
            onClick={({ currentTarget }) => {
              host.press(() => {
                handOver(currentTarget);
              });
            }}
          >
            View in space
          </Button>
        </div>
      ) : null}
      <p role="status" className={styles["status"]}>
        {shown ? lineOf(status === "failed", earth === "failed") : null}
      </p>
      <HomeOpening first={first} host={host} canvas={canvasRef} />
      {status === "on" ? (
        <Beside host={host} page={page} showsMaps={shown === "cosmos"} earth={earth} world={world} />
      ) : null}
      <Over host={host} shown={shown} running={status === "on"} flight={flight} />
    </>
  );
}
