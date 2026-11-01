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
import type { PageSigns } from "./EarthSigns.tsx";
import { SceneHost, type EarthPage, type Shown } from "./host.ts";
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

// What stands on the Earth once it is drawn.
function OnTheEarth({ host, page }: { host: SceneHost; page: EarthPage | undefined }) {
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

export function Universe({ shown, page }: { shown: Shown; page?: EarthPage | undefined }) {
  const [host] = useState(() => new SceneHost());
  const status = useSyncExternalStore(host.subscribe, host.status);
  const earth = useSyncExternalStore(host.subscribe, host.earth);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => (canvasRef.current === null ? undefined : host.attach(canvasRef.current)), [host]);
  useEffect(() => {
    host.show(shown);
  }, [host, shown]);
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
      {status === "on" && earth === "drawn" ? <OnTheEarth host={host} page={page} /> : null}
    </>
  );
}
