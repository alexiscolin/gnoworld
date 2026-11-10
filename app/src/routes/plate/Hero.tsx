// The hero under the title (the proposal's .hero): the status and the rank at the kicker's row, the lede, the actions and the talk bar. The kicker
// and the title are the route's, on the first screen; these come with the plate.
import { Chip, Cluster, Panel, Stack } from "@gnoworld/ui";
import { Actions } from "../../features/world/Actions.tsx";
import type { PlateModel } from "./model.ts";
import { TalkBar } from "./TalkBar.tsx";
import styles from "./Hero.module.css";

// Seen at the kicker's row, at the plate's right (a narrow plate: under the title).
export function Pills({ lede }: { lede: PlateModel["lede"] }) {
  const { status, rank } = lede;
  if (status === undefined && rank === undefined) return null;
  return (
    <div className={styles["pills"]}>
      <Cluster space="2xs" wrap="no">
        {rank === undefined ? null : (
          <span className={styles["pill"]} title={rank.among}>
            <Chip tone="signal" strong>
              {rank.label}
            </Chip>
          </span>
        )}
        {status === undefined ? null : (
          <span className={styles["pill"]}>
            <Chip tone={status.tone} dot strong>
              {status.label}
            </Chip>
          </span>
        )}
      </Cluster>
    </div>
  );
}

// The sentence under the title: its words, or while it is read the room of its two lines, so it never pushes what is under it when it comes.
function Sentence({ lede }: Pick<PlateModel, "lede">) {
  if (lede.sentence !== undefined)
    return (
      <div className={styles["sentence"]}>
        <Panel.Lede>{lede.sentence}</Panel.Lede>
      </div>
    );
  if (lede.pending !== true) return null;
  return (
    <Panel.Lede>
      <span className={styles["room"]} aria-hidden="true">
        {"\u00a0"}
        <br />
        {"\u00a0"}
      </span>
    </Panel.Lede>
  );
}

export function Hero({ lede, actions, talk }: Pick<PlateModel, "lede" | "actions" | "talk">) {
  return (
    <Stack space="s">
      <Sentence lede={lede} />
      <div className={styles["buttons"]}>
        <Stack space="m">
          <div className={styles["acts"]}>
            <Actions {...actions} />
          </div>
          {talk === undefined ? null : <TalkBar {...talk} />}
        </Stack>
      </div>
    </Stack>
  );
}
