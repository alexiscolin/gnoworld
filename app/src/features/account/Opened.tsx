// The account's menu itself, asked at its trigger's first press and drawn in its place, open (AccountMenu.tsx).
import { Menu, type MenuItem } from "@gnoworld/ui";
import type { ReactNode } from "react";
import { useDeviceView } from "../../deviceViews.ts";

/** The menu for `address`, or the device's for a guest; `lead` is drawn on an account's trigger, its face and address (AccountMenu.tsx). */
export function Opened({
  address,
  lead,
  onLogOut,
  onPickName,
  onJarvis,
  jarvisWhy,
  guestNote,
}: {
  address: string | undefined;
  lead: ReactNode;
  onLogOut: () => void;
  /** Opens the dialog that registers a name; none, no such item. */
  onPickName?: () => void;
  /** Opens Jarvis's panel over the room in view; none while Jarvis is off or no room is in view: the item stays greyed. */
  onJarvis?: () => void;
  /** Why the item is greyed when Jarvis is on but cannot be asked here; none, it is coming soon (Jarvis is off). */
  jarvisWhy?: string;
  /** A muted line atop a guest's menu: how a touch phone logs in, where its header has no room to say it. */
  guestNote?: string | undefined;
}) {
  const [, open] = useDeviceView();
  const items: MenuItem[] = [
    // Jarvis opens from here, greyed while it is off or no room is in view.
    onJarvis === undefined
      ? { label: "Jarvis", icon: "spark", soon: true, ...(jarvisWhy === undefined ? {} : { why: jarvisWhy }) }
      : { label: "Jarvis", icon: "spark", onSelect: onJarvis },
    {
      label: "Passport",
      icon: "passport",
      onSelect: () => {
        open("passport");
      },
    },
    ...(address === undefined
      ? []
      : [
          {
            label: "Saved",
            icon: "bookmark" as const,
            onSelect: () => {
              open("saved");
            },
          },
        ]),
    {
      label: "Settings",
      icon: "sliders",
      onSelect: () => {
        open("settings");
      },
    },
    // A key's holder frees it with no login: the way is in the menu a visitor sees.
    ...(address === undefined
      ? [
          {
            label: "Release a key",
            icon: "key" as const,
            onSelect: () => {
              open("release");
            },
          },
        ]
      : []),
    ...(address === undefined || onPickName === undefined ? [] : [{ label: "Pick a name", onSelect: onPickName }]),
    // The way out, the account's last act (frame 17: one pill in the header).
    ...(address === undefined ? [] : [{ label: "Log out", onSelect: onLogOut }]),
  ];
  return address === undefined ? (
    <Menu trigger="Menu" label="Your device" icon="menu" items={items} openAtOnce note={guestNote} />
  ) : (
    <Menu trigger="Your account" label="Your account" lead={lead} wordsHidden items={items} openAtOnce />
  );
}
