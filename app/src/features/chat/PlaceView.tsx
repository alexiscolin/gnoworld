// The full chat's small view of space at the top of its info panel: a bar with the place's buttons (who is here, the events) and the control
// that folds the view, then the place's planet as space shows it, or from above where the page's Map is on, with the Earth's signs over the
// Earth. Folded, nothing of the view runs: its engine and its context are gone, and the bar stays.
import { EARTH, hubWorldOf, worldIdOf } from "@gnoworld/core";
import { Cluster, IconButton } from "@gnoworld/ui";
import { lazy, Suspense, useState, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { useAppStore } from "../../storeContext.tsx";
import { groundOn } from "../../earthGround.ts";
import { useMapView } from "../../mapView.ts";
import type { ChatPlace } from "./ChatScreen.tsx";
import { useFull } from "./full.ts";
import { usePlanetShown } from "./planetShown.ts";
import styles from "./PlaceView.module.css";

// The engine and the signs come in their own chunks, asked once the view shows: a chat with it folded never carries them.
const MiniSpace = lazy(() => import("../../MiniSpace.tsx"));
const Signs = lazy(async () => ({ default: (await import("../../EarthSigns.tsx")).PageSigns }));

// The box's ease (PlaceView.module.css, the design system's slow motion): the engine mounts once the box is open and goes once it is closed, so its
// making and its freeing, which hold the page for a moment, never land in the middle of the ease.
const FOLD_MS = 400;

// The world space draws for the place: the Earth, a realm's, else the hub's.
const worldOf = (place: ChatPlace): string =>
  place.earth === true ? EARTH : place.realm === undefined ? hubWorldOf(place) : worldIdOf(place.realm);

export function PlaceView({ place, buttons, close }: { place: ChatPlace; buttons: ReactNode; close: ReactNode }) {
  const [shown, show] = usePlanetShown();
  const [drawn, setDrawn] = useState(shown);
  const [ground] = useState(groundOn);
  const map = useMapView();
  const store = useAppStore();
  const navigate = useNavigate();
  if (!useFull()) return null;
  return (
    <section aria-label="The place in space" className={styles["view"]} data-shown={shown ? "" : undefined}>
      <div className={styles["bar"]}>
        <Cluster justify="between">
          <Cluster space="xs">{buttons}</Cluster>
          {close}
        </Cluster>
      </div>
      <div className={styles["handle"]} data-shown={shown ? "" : undefined}>
        <Cluster justify="center">
          <IconButton
            icon="chevron"
            emphasis="plain"
            size="s"
            label={shown ? "Hide the planet" : "Show the planet"}
            onClick={() => {
              show(!shown);
              setTimeout(() => {
                setDrawn(!shown);
              }, FOLD_MS);
            }}
          />
        </Cluster>
      </div>
      <div className={styles["fold"]}>
        <div className={styles["clip"]}>
          <div className={styles["box"]}>
            {drawn ? (
              <Suspense fallback={null}>
                <MiniSpace world={worldOf(place)} map={map} ground={ground} />
                {place.earth === true ? (
                  <div className={styles["signs"]} data-map={map ? "" : undefined}>
                    <Signs
                      store={store}
                      ground={ground.ground}
                      open={(href) => {
                        Promise.resolve(navigate(href)).catch(reportError);
                      }}
                    />
                  </div>
                ) : null}
              </Suspense>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
