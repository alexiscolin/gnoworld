// The network's menu itself, asked at its trigger's first press and drawn in its place, open (Network.tsx): the networks of the data, the
// current one checked; choosing one goes by networkSwitch.ts.
import { Menu } from "@gnoworld/ui";
import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import universes from "../../../data/universes.json" with { type: "json" };
import { readPage } from "../../lib/chain/rpc.ts";
import { pageFetch } from "../../lib/query/policy.ts";
import { knownOf } from "../../knownOf.ts";
import { site } from "../../places.ts";
import { raisePill } from "../../topPill.tsx";
import { switchTo } from "./networkSwitch.ts";

// Whether a universe holds a realm, as the app says it everywhere (realms/known.ts): its worlds list it, or its chain answers a page or
// a realm with no page to draw; a read that fails says no.
async function holds(universe: string, realm: string, signal: AbortSignal): Promise<boolean> {
  const rpc = universes.find((each) => each.id === universe)?.rpc;
  const listed = site.universes
    .find((each) => each.id === universe)
    ?.worlds.some((each) => each.realms?.includes(realm));
  if (rpc === undefined) return false;
  if (listed === true) return true;
  const read = await readPage(rpc, { realm }, { fetch: pageFetch, signal });
  return read.ok || knownOf(false, { state: "failed", failure: read.failure }) === "yes";
}

export function NetworkMenu({ name }: { name: string }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  // The switch in progress: a new choice or another place ends it, and what it read then changes nothing.
  const goingRef = useRef<AbortController>(undefined);
  useEffect(
    () => () => {
      goingRef.current?.abort();
      setBusy(false);
    },
    [pathname],
  );
  const here = site.universeAt(pathname).id;
  return (
    <Menu
      trigger={name}
      label="Choose the network"
      emphasis="plain"
      size="s"
      openAtOnce
      busy={busy}
      items={site.universes.map((each) => ({
        label: each.name,
        checked: each.id === here,
        ...(each.testnet ? { note: "Testnet" } : {}),
        onSelect: () => {
          goingRef.current?.abort();
          const stop = new AbortController();
          goingRef.current = stop;
          setBusy(true);
          switchTo({ site, pathname, to: each.id, holds: (universe, realm) => holds(universe, realm, stop.signal) })
            .then(({ path, line }) => {
              if (stop.signal.aborted) return undefined;
              if (line !== undefined) raisePill({ title: line });
              return navigate(path);
            })
            .catch((error: unknown) => {
              if (!stop.signal.aborted) reportError(error);
            })
            .finally(() => {
              if (!stop.signal.aborted) setBusy(false);
            });
        },
      }))}
    />
  );
}
