// The space behind the page (ADR-0001 §7): a canvas under everything, the 3D's code loaded after the text, or on request. It stays
// mounted once it came, so a page that does not show it only covers it. The places' links stay in the page, with or without the 3D.
import { Button } from "@gnoworld/ui";
import {
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ComponentProps,
  type ComponentType,
} from "react";
import { Credits } from "./Credits.tsx";
import { FlightPanel } from "./FlightPanel.tsx";
import type { PageSigns } from "./EarthSigns.tsx";
import type { WorldMoons } from "./WorldMoons.tsx";
import type { EarthState } from "../../scene/earth/device.ts";
import { SceneHost, type EarthPage, type Shown, type WorldPage } from "./host.ts";
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
const Signs = lazy<ComponentType<ComponentProps<typeof PageSigns>>>(() =>
  import("./EarthSigns.tsx").then(
    ({ PageSigns: signs }) => ({ default: signs }),
    () => ({ default: () => null }),
  ),
);

// A world's rooms as moons, their code asked once a world stands: a chunk that does not come leaves the world without them.
const Moons = lazy<ComponentType<ComponentProps<typeof WorldMoons>>>(() =>
  import("./WorldMoons.tsx").then(
    ({ WorldMoons: moons }) => ({ default: moons }),
    () => ({ default: () => null }),
  ),
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
  readonly page: EarthPage | WorldPage | undefined;
  readonly showsMaps: boolean;
  readonly earth: EarthState;
  readonly world: EarthState;
}

// What stands with the running scene: wherever maps show, their credits.
function Beside({ host, page, showsMaps, earth, world }: BesideProps) {
  if (earth === "drawn") return <OnTheEarth host={host} page={page} />;
  if (world === "drawn") return <OnTheWorld host={host} page={page} />;
  return showsMaps ? <Credits overTicker /> : null;
}

export function Universe({ shown, page }: { shown: Shown; page?: EarthPage | WorldPage | undefined }) {
  const [host] = useState(() => new SceneHost());
  const status = useSyncExternalStore(host.subscribe, host.status);
  const earth = useSyncExternalStore(host.subscribe, host.earth);
  const world = useSyncExternalStore(host.subscribe, host.world);
  const flight = useSyncExternalStore(host.subscribe, host.flown.flight);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => (canvasRef.current === null ? undefined : host.attach(canvasRef.current)), [host]);
  useEffect(() => {
    host.show(shown, page);
  }, [host, shown, page]);
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
      {status === "on" ? (
        <Beside host={host} page={page} showsMaps={shown === "cosmos"} earth={earth} world={world} />
      ) : null}
      {shown && status === "on" ? <FlightPanel flight={flight} /> : null}
    </>
  );
}
