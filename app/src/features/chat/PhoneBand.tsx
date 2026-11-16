// A phone's place band, under the chat header: the planet the wide full chat draws in its info column (PlaceView's, MiniSpace with no
// cosmos) beside the place's key words, and "Its page". It folds to a slim row (a small planet and the name) while a chat field has the focus
// and on a short window (PhoneBand.module.css), and while the lines are scrolled up (`folded`, bandFold.ts). The engine's code is asked
// after the first paint (a lazy import), and MiniSpace makes its WebGL context only where gpuCanDraw says the device can draw: none on any other.
import { Cluster, Kicker, Stack } from "@gnoworld/ui";
import { lazy, Suspense, useState } from "react";
import { groundOn } from "../../earthGround.ts";
import type { ChatPlace } from "./ChatScreen.tsx";
import { PageButton } from "./PlaceSheet.tsx";
import { worldOf } from "./PlaceView.tsx";
import styles from "./PhoneBand.module.css";

const MiniSpace = lazy(() => import("../../MiniSpace.tsx"));

const firstLine = (text: string): string => text.split("\n", 1)[0] ?? "";

export function PhoneBand({
  place,
  talking,
  present,
  folded,
  onPage,
}: {
  place: ChatPlace;
  talking?: number | undefined;
  present?: number | undefined;
  folded: boolean;
  onPage: () => void;
}) {
  const [ground] = useState(groundOn);
  const counts = [
    talking === undefined ? undefined : `${String(talking)} talking now`,
    present === undefined ? undefined : `${String(present)} here now`,
  ].filter((each) => each !== undefined);
  return (
    <section aria-label={place.name} className={styles["band"]} data-folded={folded ? "" : undefined}>
      <Cluster space="xs" wrap="no">
        <div className={styles["planet"]} aria-hidden="true">
          <Suspense fallback={null}>
            <MiniSpace world={worldOf(place)} ground={ground} />
          </Suspense>
        </div>
        <div className={styles["words"]}>
          <Stack space="3xs">
            <div className={styles["more"]}>
              <Kicker>{place.kicker}</Kicker>
            </div>
            <p className={`${styles["name"] ?? ""} truncate`}>{place.name}</p>
            <p className={`${styles["more"] ?? ""} meta truncate`}>{firstLine(place.description)}</p>
            <div className={styles["more"]}>
              <Cluster justify="between" space="2xs" wrap="no">
                <p className="meta">{counts.join(" · ")}</p>
                <PageButton onOpen={onPage} />
              </Cluster>
            </div>
          </Stack>
        </div>
      </Cluster>
    </section>
  );
}
