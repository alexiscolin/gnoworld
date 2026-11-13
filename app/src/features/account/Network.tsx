// The network the site reads, named always, a testnet saying "Testnet" (DESIGN-SYSTEM.md, Trust): in the header's row, and in the account's
// pill or the way in after a divider on a computer, where the header's own goes (D330, D340); there the chip alone, no warning icon (D341).
import { Chip, Icon } from "@gnoworld/ui";
import styles from "./Network.module.css";

export function Network({ name, testnet, inPill = false }: { name: string; testnet: boolean; inPill?: boolean }) {
  return (
    <span className={inPill ? styles["inPill"] : styles["network"]}>
      {name}
      {testnet ? (
        <span className={`with-icon ${String(styles["caution"])} enter`}>
          {inPill ? null : <Icon name="warning" />}
          <Chip tone="warm">Testnet</Chip>
        </span>
      ) : null}
    </span>
  );
}
