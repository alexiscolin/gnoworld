// What it can do (D566): the capabilities its imports name, one chip each; a chip picked says the line that shows it. A realm with none says so.
import { useState } from "react";
import { Card, Chip, Cluster, Stack } from "@gnoworld/ui";
import type { Capability } from "./capabilities.ts";
import styles from "./Can.module.css";

export function Can({ can }: { can: readonly Capability[] }) {
  const [picked, setPicked] = useState<string>();
  const line = can.find(({ label }) => label === picked);
  return (
    <Card look="hub">
      <Card.Header title="What it can do" level={2} hint="read from its imports" />
      <Card.Body>
        <Stack space="xs">
          <Cluster space="2xs">
            {can.map(({ label }) => (
              <Chip
                key={label}
                selected={label === picked}
                onClick={() => {
                  setPicked(label === picked ? undefined : label);
                }}
              >
                {label}
              </Chip>
            ))}
            {can.length === 0 ? (
              <span className={styles["hint"]}>No token, NFT or governance capability found.</span>
            ) : null}
          </Cluster>
          <p className="data-text" aria-live="polite">
            {line === undefined ? "Select a capability to read what shows it." : `${line.label} · ${line.line}`}
          </p>
        </Stack>
      </Card.Body>
    </Card>
  );
}
