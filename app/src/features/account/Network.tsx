// The network the site reads, named always, a testnet saying "Testnet" (DESIGN-SYSTEM.md, Trust): in the header's row, and in the account's
// pill or the way in, beside them, no divider, on a computer, where the header's own goes; there the chip alone, no warning icon. The name is a menu of
// the networks (D13501), its code, the chain's and the switch's coming at its first press, as the account's menu does (AccountMenu.tsx).
import { Button, Chip, Icon } from "@gnoworld/ui";
import { lazy, Suspense, useState } from "react";
import styles from "./Network.module.css";

const Choice = lazy(async () => ({ default: (await import("./NetworkMenu.tsx")).NetworkMenu }));

export function Network({ name, testnet, inPill = false }: { name: string; testnet: boolean; inPill?: boolean }) {
  const [asked, setAsked] = useState(false);
  // The trigger as the menu draws it, until the menu's code takes its place, open.
  const trigger = (
    <Button
      emphasis="quiet"
      size="s"
      onClick={() => {
        setAsked(true);
      }}
    >
      {name}
    </Button>
  );
  return (
    <span className={inPill ? styles["inPill"] : styles["network"]}>
      <Suspense fallback={trigger}>{asked ? <Choice name={name} /> : trigger}</Suspense>
      {testnet ? (
        <span className={`with-icon ${String(styles["caution"])} enter`}>
          {inPill ? null : <Icon name="warning" />}
          <Chip tone="warm">Testnet</Chip>
        </span>
      ) : null}
    </span>
  );
}
