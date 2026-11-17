// A guest's place of the composer: the composer's box, saying what an
// account may do here, and the way in, which asks the header's one account control (pageAsks.ts).
import { Button, Cluster, Stack } from "@gnoworld/ui";
import { askFor } from "../../pageAsks.ts";
import { USE_A_COMPUTER } from "../login/index.ts";
import { useComputerNeeded } from "./computerNeeded.ts";
import { LOG_IN_TO_WRITE } from "./loginWords.ts";
import box from "./MessageBox.module.css";
import styles from "./LogInToWrite.module.css";

export function LogInToWrite() {
  const computer = useComputerNeeded();
  return (
    <div className={box["box"]}>
      <div className={styles["inner"]}>
        <Cluster justify="between" className={styles["way"]}>
          <Stack space="3xs">
            <strong className={styles["lead"]}>Join the conversation</strong>
            <span className="meta">{computer ? USE_A_COMPUTER : LOG_IN_TO_WRITE}</span>
          </Stack>
          {computer ? null : (
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
          )}
        </Cluster>
      </div>
    </div>
  );
}
