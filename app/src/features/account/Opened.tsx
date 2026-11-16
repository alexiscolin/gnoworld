// The account's menu itself, asked at its trigger's first press and drawn in its place, open (AccountMenu.tsx).
import { Menu, type IconName, type MenuItem } from "@gnoworld/ui";
import type { ReactNode } from "react";
import { useCredits } from "../credits/index.ts";
import { useDeviceView, type DeviceView } from "../../deviceViews.ts";
import { useNetworkItems } from "./NetworkMenu.tsx";

// Jarvis opens from here, greyed while it is off or no room is in view.
const jarvisRow = (onJarvis: (() => void) | undefined, why: string | undefined): MenuItem =>
  onJarvis === undefined
    ? { label: "Jarvis", icon: "spark", soon: true, ...(why === undefined ? {} : { why }) }
    : { label: "Jarvis", icon: "spark", onSelect: onJarvis };

// A network's row among the account's own, so it reads as the network and not as a place.
const named = (item: MenuItem): MenuItem => ("soon" in item ? item : { ...item, label: `Network: ${item.label}` });

// An account's last acts: the name to pick, then the way out (frame 17: one pill in the header).
const ownRows = (account: boolean, onPickName: (() => void) | undefined, onLogOut: () => void): MenuItem[] =>
  account
    ? [
        ...(onPickName === undefined ? [] : [{ label: "Pick a name", onSelect: onPickName }]),
        { label: "Log out", onSelect: onLogOut },
      ]
    : [];

/** The menu for `address`, or the device's for a guest; `lead` is drawn on an account's trigger, its face and address (AccountMenu.tsx). */
export function Opened({
  address,
  lead,
  onLogOut,
  onPickName,
  onJarvis,
  jarvisWhy,
  guestNote,
  onConnect,
  phone,
}: {
  address: string | undefined;
  lead: ReactNode;
  onLogOut: () => void;
  /** Opens the dialog that registers a name; none, no such item. */
  onPickName?: (() => void) | undefined;
  /** Opens Jarvis's panel over the room in view; none while Jarvis is off or no room is in view: the item stays greyed. */
  onJarvis?: () => void;
  /** Why the item is greyed when Jarvis is on but cannot be asked here; none, it is coming soon (Jarvis is off). */
  jarvisWhy?: string;
  /** A muted line atop a guest's menu: how a touch phone logs in, where its header has no room to say it. */
  guestNote?: string | undefined;
  /** A guest's way in, where Adena is found on a phone: its header has no room for the button, so it is the menu's first row. */
  onConnect?: (() => void) | undefined;
  /** A phone's header holds no network: its choices are rows of this menu. */
  phone?: boolean | undefined;
}) {
  const [, open] = useDeviceView();
  const network = useNetworkItems();
  const credits = useCredits();
  // A row that opens one of the device's views.
  const to = (label: string, icon: IconName, view: DeviceView): MenuItem => ({
    label,
    icon,
    onSelect: () => {
      open(view);
    },
  });
  const items: MenuItem[] = [
    ...(address === undefined && onConnect !== undefined ? [{ label: "Connect Adena", onSelect: onConnect }] : []),
    // A phone has no use for a greyed "Jarvis, soon": the row shows once it can act.
    ...(phone && onJarvis === undefined ? [] : [jarvisRow(onJarvis, jarvisWhy)]),
    to("Passport", "passport", "passport"),
    ...(address === undefined ? [] : [to("Saved", "bookmark", "saved")]),
    to("Settings", "sliders", "settings"),
    // A phone draws no fixed Credits corner (CC BY 4.0 allows a link): the menu holds it.
    ...(phone ? [{ label: "Credits", onSelect: credits.show }] : []),
    ...(phone ? network.items.map(named) : []),
    // A key's holder frees it with no login: the way is in the menu a visitor sees.
    ...(address === undefined ? [to("Release a key", "key", "release")] : []),
    ...ownRows(address !== undefined, onPickName, onLogOut),
  ];
  const menu =
    address === undefined ? (
      <Menu
        trigger="Menu"
        label="Your device"
        icon="menu"
        items={items}
        openAtOnce
        note={guestNote}
        busy={network.busy}
      />
    ) : (
      <Menu
        trigger="Your account"
        label="Your account"
        lead={lead}
        wordsHidden
        items={items}
        openAtOnce
        busy={network.busy}
      />
    );
  return (
    <>
      {menu}
      {credits.dialog}
    </>
  );
}
