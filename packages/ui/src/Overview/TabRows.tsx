// The overview's tabs: a row with its panel, and an icon-only row.
import { useState } from "react";
import { Stack } from "../compositions/index.ts";
import { TabPanel } from "../Tabs/TabPanel.tsx";
import { Tabs } from "../Tabs/Tabs.tsx";

export function TabRows() {
  const [view, setView] = useState<string | null>("cosmos");
  return (
    <Stack>
      <Tabs
        label="Views"
        id="views"
        tabs={[
          { id: "earth", label: "Earth" },
          { id: "cosmos", label: "Cosmos" },
          { id: "list", label: "List", count: 12 },
        ]}
        selected={view}
        onSelect={setView}
      />
      <TabPanel id="views" tab={view ?? "cosmos"}>
        The panel of the chosen tab, named by it.
      </TabPanel>
      <Tabs
        label="Library"
        iconOnly
        tabs={[
          { id: "worlds", label: "Worlds", icon: "planet" },
          { id: "people", label: "People", icon: "people" },
        ]}
        selected="worlds"
        onSelect={() => undefined}
      />
    </Stack>
  );
}
