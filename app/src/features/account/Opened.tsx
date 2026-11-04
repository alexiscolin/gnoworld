// The account's menu itself, asked at its trigger's first press and drawn in its place, open (AccountMenu.tsx).
import { Menu, type MenuItem } from "@gnoworld/ui";
import type { ReactNode } from "react";
import { useDeviceView } from "../../deviceViews.ts";

export function Opened({ address, face }: { address: string | undefined; face: ReactNode }) {
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
  ];
  return address === undefined ? (
    <Menu trigger="Menu" label="Your device" icon="menu" items={items} openAtOnce />
  ) : (
    <Menu trigger="Your account" label="Your account" lead={face} wordsHidden items={items} openAtOnce />
  );
}
