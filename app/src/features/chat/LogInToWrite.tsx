// A guest's place of the composer (Alexis, 2026-11-07: "un CTA pour la connexion, un texte plus joli"): the composer's box, saying what an
// account may do here, and the way in, which asks the header's one account control (pageAsks.ts).
import { Button, Cluster, Stack } from "@gnoworld/ui";
import { askFor } from "../../pageAsks.ts";
import { LOG_IN_TO_WRITE } from "./loginWords.ts";
import box from "./MessageBox.module.css";
import styles from "./LogInToWrite.module.css";

export function LogInToWrite() {
  return (
    <div className={box["box"]}>
      <div className={styles["inner"]}>
        <Cluster justify="between">
          <Stack space="3xs">
            <strong className={styles["lead"]}>Join the conversation</strong>
            <span className={styles["note"]}>{LOG_IN_TO_WRITE}</span>
          </Stack>
          <Button
            emphasis="solid"
            size="s"
            icon="key"
            onClick={() => {
              askFor("log-in");
            }}
          >
            Connect Adena
          </Button>
        </Cluster>
      </div>
    </div>
  );
}
