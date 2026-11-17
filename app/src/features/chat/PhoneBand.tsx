// A phone's place band, the top of its chat: the place's kind, name and counts over its planet (the one the wide full chat draws in its info
// column: PlaceView's MiniSpace with no cosmos), all one button to Info; under it the rooms' row (PhoneHeader.tsx, its `children`). It is the
// world's own plate (data-world: --color-plate). It folds to a slim row (the room's name, a small planet) while the lines are scrolled up
// (`folded`, bandFold.ts), and with the rooms' row hidden while a chat field has the focus and on a short window (PhoneBand.module.css). The
// planet is a big disc at the band's end, its top half showing, the band's foot cropping it; its box never changes size, only its scale, so the fold moves no canvas; the engine's code is asked once the page is idle and the band in view (planetGate.ts), and MiniSpace makes its WebGL context only where gpuCanDraw says the device can draw, the planet's still standing where it cannot.
import { Cluster, Icon, Kicker, Stack } from "@gnoworld/ui";
import { lazy, Suspense, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { groundOn } from "../../earthGround.ts";
import type { ChatPlace } from "./ChatScreen.tsx";
import { WorldPlanet } from "../../WorldPlanet.tsx";
import { worldOf } from "./PlaceView.tsx";
import { askPlanet, whenIdleAndSeen } from "../../planetGate.ts";
import styles from "./PhoneBand.module.css";

const MiniSpace = lazy(() => import("../../MiniSpace.tsx"));

// "3 talking now · 12 here", "Quiet · 12 here": only what is known.
function countsOf(talking: number | undefined, present: number | undefined): string {
  const said = [
    talking === undefined ? undefined : talking > 0 ? `${String(talking)} talking now` : "Quiet",
    present === undefined ? undefined : `${String(present)} here`,
  ];
  return said.filter((each) => each !== undefined).join(" · ");
}

// The planet in its fixed box: its still stands till the engine has drawn, and stays where it cannot draw (no GPU) or must not (the gate,
// planetGate.ts: the engine is asked once the page is idle and the band in view, never to a reader who saves data).
function Planet({ place }: { place: ChatPlace }) {
  const [ground] = useState(groundOn);
  const [drawn, setDrawn] = useState(false);
  const [asked, setAsked] = useState(false);
  const bandRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (bandRef.current === null) return;
    const leaving = new AbortController();
    whenIdleAndSeen(bandRef.current, leaving.signal)
      .then(() => {
        if (askPlanet() !== undefined) setAsked(true);
      })
      .catch((error: unknown) => {
        reportError(error);
      });
    return () => {
      leaving.abort();
    };
  }, []);
  return (
    <div ref={bandRef} className={styles["planet"]} aria-hidden="true">
      {drawn ? null : (
        <div className={styles["still"]}>
          <WorldPlanet world={worldOf(place)} fallback="" name={place.name} size="l" decorative />
        </div>
      )}
      {asked ? (
        <Suspense fallback={null}>
          <MiniSpace
            world={worldOf(place)}
            ground={ground}
            onDrawn={() => {
              setDrawn(true);
            }}
          />
        </Suspense>
      ) : null}
    </div>
  );
}

export function PhoneBand({
  place,
  title,
  mark,
  talking,
  present,
  folded,
  onInfo,
  children,
}: {
  place: ChatPlace;
  /** The room in view (or a direct message's partner): the page's heading, and the folded row's name. */
  title: ReactNode;
  /** A short mark by the counts, always in view: a direct message's "Not encrypted". */
  mark?: ReactNode;
  talking?: number | undefined;
  present?: number | undefined;
  folded: boolean;
  onInfo: () => void;
  /** The rooms' row. */
  children?: ReactNode;
}) {
  const metaId = useId();
  return (
    <section
      aria-label={place.name}
      className={styles["band"]}
      data-phone-band=""
      data-world=""
      data-earth={place.earth === true ? "" : undefined}
      data-folded={folded ? "" : undefined}
    >
      <h1 className="visually-hidden">{title}</h1>
      <Planet place={place} />
      <Cluster space="xs" wrap="no" className={styles["place"]}>
        {/* The whole row is the press: its words are for the eye (the button says the place and, described, its counts). */}
        <button
          type="button"
          className={styles["press"]}
          aria-label={`${place.name}: info and its page`}
          aria-describedby={metaId}
          onClick={onInfo}
        />
        <Stack space="3xs" className={styles["text"]}>
          <Stack space="3xs" aria-hidden="true">
            <Kicker>{place.kicker}</Kicker>
            <Cluster space="2xs" wrap="no" className={styles["name"]}>
              <span className={`${styles["rest"] ?? ""} truncate`}>{place.name}</span>
              <span className={`${styles["folded"] ?? ""} truncate`}>{title}</span>
              <Icon name="chevron" />
            </Cluster>
          </Stack>
          <Cluster space="2xs" wrap="no" className={styles["counts"]}>
            <p id={metaId} className={`${styles["meta"] ?? ""} meta truncate`}>
              {talking !== undefined && talking > 0 ? (
                <span className="dot" data-tone="warm" aria-hidden="true" />
              ) : null}
              {countsOf(talking, present)}
            </p>
            {mark === undefined ? null : <span className={styles["mark"]}>{mark}</span>}
          </Cluster>
        </Stack>
      </Cluster>
      {children}
    </section>
  );
}
