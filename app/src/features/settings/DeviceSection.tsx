// What this device keeps (ADR-0002 §1, "this device"): the passport, exported to a file, read back from one, or cleared; an account's
// saved messages and drafts, cleared. A clear removes what it names and nothing else; a file read back replaces the passport whole.
import type { Address } from "@gnoworld/schemas";
import { Button, Cluster, Stack } from "@gnoworld/ui";
import { useState } from "react";
import { clearPageDrafts } from "../../lib/drafts/page.ts";
import { passportFile, readPassportFile } from "../../lib/keep/device.ts";
import { useApp, useAppStore } from "../../storeContext.tsx";
import styles from "./Settings.module.css";

// Hands the passport to the viewer as a file of their own: nothing leaves the device but through their save.
function download(text: string) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  link.download = "gnoworld-passport.json";
  link.click();
  URL.revokeObjectURL(link.href);
}

// An account's saved messages and drafts, cleared one kind at a time.
function AccountClears({ account, onSaid }: { account: Address; onSaid: (said: string) => void }) {
  const store = useAppStore();
  const saved = useApp(({ keep }) => keep.saved);
  return (
    <Cluster space="2xs">
      <Button
        size="s"
        tone="danger"
        onClick={() => {
          const { unsave } = store.getState().keepActions;
          for (const line of saved) unsave(line.room, line.id);
          onSaid("Saved messages cleared.");
        }}
      >
        Clear saved messages
      </Button>
      <Button
        size="s"
        tone="danger"
        onClick={() => {
          onSaid(clearPageDrafts(account) ? "Drafts cleared." : "This device did not let it.");
        }}
      >
        Clear drafts
      </Button>
    </Cluster>
  );
}

export function DeviceSection({ account }: { account: Address | undefined }) {
  const store = useAppStore();
  const stamps = useApp(({ device }) => device.stamps);
  const charted = useApp(({ device }) => device.charted);
  const [said, setSaid] = useState("");
  const { change } = store.getState().deviceActions;
  const replace = (next: { stamps: Record<string, string>; charted: Record<string, string> }) =>
    change("stamps", () => next.stamps) && change("charted", () => next.charted);
  const count = Object.keys(stamps).length;
  return (
    <section aria-labelledby="settings-device">
      <Stack space="xs">
        <h3 id="settings-device">This device</h3>
        <p className={styles["help"]}>
          Your passport holds {count} {count === 1 ? "stamp" : "stamps"}. It stays in this browser unless you export it.
        </p>
        <Cluster space="2xs">
          <Button
            size="s"
            onClick={() => {
              download(passportFile({ stamps, charted }));
            }}
          >
            Export the passport
          </Button>
          <label className={styles["file"]}>
            <span className="visually-hidden">Import a passport file</span>
            <input
              type="file"
              accept="application/json,.json"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                event.currentTarget.value = "";
                if (file === undefined) return;
                file
                  .text()
                  .then((text) => {
                    const read = readPassportFile(text);
                    if (read === undefined) setSaid("That file is no gnoworld passport: nothing changed.");
                    else setSaid(replace(read) ? "Passport imported." : "This device did not keep it.");
                  })
                  .catch(() => {
                    setSaid("The file could not be read: nothing changed.");
                  });
              }}
            />
          </label>
          <Button
            size="s"
            tone="danger"
            onClick={() => {
              setSaid(replace({ stamps: {}, charted: {} }) ? "Passport cleared." : "This device did not keep it.");
            }}
          >
            Clear the passport
          </Button>
        </Cluster>
        {account === undefined ? null : <AccountClears account={account} onSaid={setSaid} />}
        <p role="status" className={styles["help"]}>
          {said}
        </p>
      </Stack>
    </section>
  );
}
