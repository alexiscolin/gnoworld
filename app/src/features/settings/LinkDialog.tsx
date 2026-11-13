// The dialog that links an account (owners' moderation, part 5; the approved proposal's "The screens"): two tabs, Adena and Command line.
import type { Address } from "@gnoworld/schemas";
import { Dialog, Stack, Tabs } from "@gnoworld/ui";
import { useState } from "react";
import { AdenaTab } from "./AdenaTab.tsx";
import { CommandTab } from "./CommandTab.tsx";

const TABS = [
  { id: "adena", label: "Adena" },
  { id: "cli", label: "Command line" },
];

export function LinkDialog({ me, onLinked, onClose }: { me: Address; onLinked: () => void; onClose: () => void }) {
  const [tab, setTab] = useState("adena");
  return (
    <Dialog title="Link an account" open onClose={onClose}>
      <Stack space="s">
        <Tabs label="Kind of account" tabs={TABS} selected={tab} onSelect={setTab} size="s" />
        {tab === "adena" ? (
          <AdenaTab me={me} onLinked={onLinked} onCancel={onClose} />
        ) : (
          <CommandTab onLinked={onLinked} onCancel={onClose} />
        )}
      </Stack>
    </Dialog>
  );
}
