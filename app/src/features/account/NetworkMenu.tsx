// The network's menu itself, asked at its trigger's first press and drawn in its place, open (Network.tsx): the networks of the data, the
// current one checked. Choosing another reloads the page on that network's home (D14004): its worlds, rooms, caches and scene start whole
// from the page's first load, with no swap inside the running app; no chain is read to keep the place.
import { Menu, type MenuItem } from "@gnoworld/ui";
import { useLocation } from "react-router";
import { site, universePrefix } from "../../places.ts";

/** The networks as the menu's choices, the current one checked: the network's own menu draws them, and a phone's account menu, which
 * holds the network, as rows among its own. */
export function useNetworkItems(): MenuItem[] {
  const here = site.universeAt(useLocation().pathname).id;
  return site.universes.map((each) => ({
    label: each.name,
    checked: each.id === here,
    ...(each.testnet ? { note: "Testnet" } : {}),
    onSelect: () => {
      if (each.id !== here) location.assign(universePrefix(each) || "/");
    },
  }));
}

export function NetworkMenu({ name }: { name: string }) {
  return (
    <Menu trigger={name} label="Choose the network" emphasis="plain" size="s" openAtOnce items={useNetworkItems()} />
  );
}
