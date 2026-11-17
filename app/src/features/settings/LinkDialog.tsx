// The dialog that links an account: two tabs, Adena and Command line, each tab's panel named by its tab; the tab track as wide as its
// tabs, at the content's start (the UX pass).
import type { Address } from "@gnoworld/schemas";
import { Cluster, Dialog, TabPanel, Tabs } from "@gnoworld/ui";
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
    <Dialog
      title="Link an account"
      description="The account to link signs a text, then you sign the same text."
      open
      onClose={onClose}
    >
      <Cluster>
        <Tabs id="link-way" label="Kind of account" tabs={TABS} selected={tab} onSelect={setTab} size="s" />
      </Cluster>
      <TabPanel id="link-way" tab={tab}>
        {tab === "adena" ? (
          <AdenaTab me={me} onLinked={onLinked} onCancel={onClose} />
        ) : (
          <CommandTab me={me} onLinked={onLinked} onCancel={onClose} />
        )}
      </TabPanel>
    </Dialog>
  );
}
