// Under an account's composer while it has no name on the page's chain (D13982): the room reads its address, and the way to a name
// people can read, which the header's account control opens (pageAsks.ts).
import { Button, Cluster } from "@gnoworld/ui";
import { askFor, useNameless } from "../../pageAsks.ts";
import styles from "./LogInToWrite.module.css";

export function NameNudge() {
  if (!useNameless()) return null;
  return (
    <Cluster justify="between">
      <span className={styles["note"]}>People here read your address. Pick a gno.land name they can read.</span>
      <Button
        size="s"
        icon="at"
        onClick={() => {
          askFor("pick-name");
        }}
      >
        Pick a name
      </Button>
    </Cluster>
  );
}
