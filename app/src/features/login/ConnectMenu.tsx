// The header's Connect, once pressed (D13881): the burger menu's own component and look, two ways in. Its code comes with the first
// press, never with the first screen, as the device's menu does (account/Opened.tsx).
import { Menu } from "@gnoworld/ui";
import type { ReactNode } from "react";

export interface ConnectMenuProps {
  /** The trigger's words: Connect, the step a login is at, or why the last one stopped. */
  words: string;
  lead: ReactNode;
  busy: boolean;
  onAdena: () => void;
  onKey: () => void;
}

export function ConnectMenu({ words, lead, busy, onAdena, onKey }: ConnectMenuProps) {
  const items = [
    { label: "Adena", onSelect: onAdena },
    { label: "gnokey", onSelect: onKey },
  ];
  return <Menu trigger={words} label="Connect with" lead={lead} busy={busy} items={items} openAtOnce />;
}
