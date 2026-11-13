// What this device keeps (ADR-0002 §1, "this device"): the passport, exported to a file, read back from one, or cleared; an account's
// saved messages and drafts, cleared. A clear removes what it names and nothing else; a file read back replaces the passport whole.
import type { Address } from "@gnoworld/schemas";
import { Button, Cluster, Stack } from "@gnoworld/ui";
import { useRef, useState } from "react";
import { clearPageDrafts } from "../../lib/drafts/page.ts";
import { passportFile, readPassportFile } from "../../lib/keep/device.ts";
import { useApp, useAppStore } from "../../storeContext.tsx";
import { Section, Setting } from "./Section.tsx";
import styles from "./Settings.module.css";

interface Passport {
  stamps: Record<string, string>;
  charted: Record<string, string>;
}

// Hands the passport to the viewer as a file of their own: nothing leaves the device but through their save.
function download(text: string) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  link.download = "gnoworld-passport.json";
  link.click();
  URL.revokeObjectURL(link.href);
}

// One clear: what it removes at the start, its danger button at the end, or under the words at its own width where the row is narrow.
function Clear({ name, line, act, onClear }: { name: string; line: string; act: string; onClear: () => void }) {
  return (
    <li className={styles["clear"]}>
      <Setting name={<span className={styles["name"]}>{name}</span>} line={<span className="meta">{line}</span>}>
        <span>
          <Button size="s" tone="danger" onClick={onClear}>
            {act}
          </Button>
        </span>
      </Setting>
    </li>
  );
}

// An account's saved messages and drafts, cleared one kind at a time.
function AccountClears({ account, onSaid }: { account: Address; onSaid: (said: string) => void }) {
  const store = useAppStore();
  return (
    <>
      <Clear
        name="Saved messages"
        line="Those this account kept on this device."
        act="Clear saved messages"
        onClear={() => {
          store.getState().keepActions.clearSaved();
          onSaid("Saved messages cleared.");
        }}
      />
      <Clear
        name="Drafts"
        line="What this account began and did not send."
        act="Clear drafts"
        onClear={() => {
          onSaid(clearPageDrafts(account) ? "Drafts cleared." : "This device did not let it.");
        }}
      />
    </>
  );
}

// The passport's file: exported, or read back through a button that opens the hidden file input, the file's name shown once picked.
function PassportFile({ passport, onRead }: { passport: Passport; onRead: (file: File) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [picked, setPicked] = useState<string | undefined>(undefined);
  const count = Object.keys(passport.stamps).length;
  return (
    <Stack space="xs">
      <Stack space="3xs">
        <span className={styles["name"]}>Passport</span>
        <p className="meta">
          Your passport holds {count} {count === 1 ? "stamp" : "stamps"}. It stays in this browser unless you export it.
        </p>
      </Stack>
      <Cluster space="2xs">
        <Button
          size="s"
          onClick={() => {
            download(passportFile(passport));
          }}
        >
          Export the passport
        </Button>
        <Button size="s" onClick={() => fileRef.current?.click()}>
          Import a passport
        </Button>
        {picked === undefined ? null : <span className="meta">{picked}</span>}
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = "";
            if (file === undefined) return;
            setPicked(file.name);
            onRead(file);
          }}
        />
      </Cluster>
    </Stack>
  );
}

export function DeviceSection({ account }: { account: Address | undefined }) {
  const store = useAppStore();
  const stamps = useApp(({ device }) => device.stamps);
  const charted = useApp(({ device }) => device.charted);
  const [said, setSaid] = useState("");
  // The passport replaced whole or not at all: a field the device refused puts the other back as it was.
  const replace = (next: Passport) => {
    const { change } = store.getState().deviceActions;
    const before = store.getState().device;
    if (change("stamps", () => next.stamps) && change("charted", () => next.charted)) return true;
    change("stamps", () => before.stamps);
    change("charted", () => before.charted);
    return false;
  };
  const read = (file: File) => {
    file
      .text()
      .then((text) => {
        const passport = readPassportFile(text);
        if (passport === undefined) setSaid("That file is no gnoworld passport: nothing changed.");
        else setSaid(replace(passport) ? "Passport imported." : "This device did not keep it.");
      })
      .catch(() => {
        setSaid("The file could not be read: nothing changed.");
      });
  };
  return (
    <Section id="settings-device" title="This device">
      <PassportFile passport={{ stamps, charted }} onRead={read} />
      <Stack as="ul" space="xs">
        <Clear
          name="Stamps and worlds charted"
          line="The passport on this browser. A file you exported keeps its own."
          act="Clear the passport"
          onClear={() => {
            setSaid(replace({ stamps: {}, charted: {} }) ? "Passport cleared." : "This device did not keep it.");
          }}
        />
        {account === undefined ? null : <AccountClears account={account} onSaid={setSaid} />}
      </Stack>
      <p role="status" className="meta">
        {said}
      </p>
    </Section>
  );
}
