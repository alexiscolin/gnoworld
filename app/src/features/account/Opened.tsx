// The account's menu itself, asked at its trigger's first press and drawn in its place, open (AccountMenu.tsx).
import { Menu, type MenuItem } from "@gnoworld/ui";
import type { ReactNode } from "react";
import { useDeviceView } from "../../deviceViews.ts";

/** The menu for `address`, or the device's for a guest; `lead` is drawn on an account's trigger, its face and address (AccountMenu.tsx). */
export function Opened({
  address,
  lead,
  onLogOut,
}: {
  address: string | undefined;
  lead: ReactNode;
  onLogOut: () => void;
}) {
  const [, open] = useDeviceView();
  const items: MenuItem[] = [
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
    // The way out, the account's last act (frame 17: one pill in the header).
    ...(address === undefined ? [] : [{ label: "Log out", onSelect: onLogOut }]),
  ];
  return address === undefined ? (
    <Menu trigger="Menu" label="Your device" icon="menu" items={items} openAtOnce />
  ) : (
    <Menu trigger="Your account" label="Your account" lead={lead} wordsHidden items={items} openAtOnce />
  );
}
