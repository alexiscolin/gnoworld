// The network's menu itself, asked at its trigger's first press and drawn in its place, open (Network.tsx): the networks of the data, the
// current one checked; choosing one goes by networkSwitch.ts.
import { Menu } from "@gnoworld/ui";
import { useState } from "react";
import { useLocation, useNavigate } from "react-router";
import universes from "../../../data/universes.json" with { type: "json" };
import { readPage } from "../../lib/chain/rpc.ts";
import { pageFetch } from "../../lib/query/policy.ts";
import { site } from "../../places.ts";
import { raisePill } from "../../topPill.tsx";
import { switchTo } from "./networkSwitch.ts";

// Whether a universe's chain holds a realm: a read that fails says no.
async function holds(universe: string, realm: string): Promise<boolean> {
  const rpc = universes.find((each) => each.id === universe)?.rpc;
  return rpc !== undefined && (await readPage(rpc, { realm }, { fetch: pageFetch })).ok;
}

export function NetworkMenu({ name }: { name: string }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [busy, setBusy] = useState<string>();
  const here = site.universeAt(pathname).id;
  return (
    <Menu
      trigger={name}
      label="Choose the network"
      emphasis="plain"
      size="s"
      openAtOnce
      items={site.universes.map((each) => ({
        label: each.name,
        checked: each.id === here,
        busy: busy === each.id,
        ...(each.testnet ? { note: "Testnet" } : {}),
        onSelect: () => {
          setBusy(each.id);
          switchTo({ site, pathname, to: each.id, holds })
            .then(({ path, line }) => {
              if (line !== undefined) raisePill({ title: line });
              return navigate(path);
            })
            .catch(reportError)
            .finally(() => {
              setBusy(undefined);
            });
        },
      }))}
    />
  );
}
