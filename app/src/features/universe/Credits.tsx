// The attributions (docs/DESIGN-SYSTEM.md, Credits): one word wherever textures show, and the full credits a press away, which CC BY 4.0
// §3(a)(2) allows. In the universe's chunk: a page with no space pays nothing for it.
import { useCredits } from "../credits/index.ts";
import { FOOTPRINT } from "./railFootprint.ts";
import styles from "./Universe.module.css";

export function Credits() {
  const { show, dialog } = useCredits();
  return (
    <>
      <button type="button" className={styles["credits"]} style={FOOTPRINT} onClick={show}>
        Credits
      </button>
      {dialog}
    </>
  );
}
