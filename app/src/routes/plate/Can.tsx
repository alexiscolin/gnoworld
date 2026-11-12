// What it can do (D566): the capabilities its imports name, one chip each; a chip picked says the line that shows it. A reading aid, never a
// verdict: what the code does is read on gnoweb, which the card links to.
import { useState } from "react";
import { Button, Card, Chip, Cluster, Stack } from "@gnoworld/ui";
import type { Capability } from "./capabilities.ts";
import styles from "./Can.module.css";

export function Can({ can, link }: { can: readonly Capability[]; link: string | undefined }) {
  const [picked, setPicked] = useState<string>();
  const line = can.find(({ label }) => label === picked);
  return (
    <Card look="hub" rises>
      <Card.Header
        icon="shield"
        title="What it can do"
        level={2}
        hint="read from its imports"
        actions={
          link === undefined ? undefined : (
            <Button href={link} size="s" icon="arrow-up-right">
              Read its code on gnoweb
            </Button>
          )
        }
      />
      <Card.Body>
        <Stack space="s">
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
              <span className={styles["hint"]}>Its imports name no coin, admin or token package.</span>
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
