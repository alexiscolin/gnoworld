// The overview's combobox, holding what is typed as a page's does.
import { useState } from "react";
import { Combobox } from "../Combobox/Combobox.tsx";

const GROUPS = [
  { id: "world", label: "Worlds", options: [{ id: "/w/bubble", label: "Bubble" }] },
  { id: "ecosystem", label: "Ecosystems", options: [{ id: "/e/tokens", label: "Tokens" }] },
];

export function Comboboxes() {
  const [value, setValue] = useState("");
  return (
    <Combobox label="Search places" value={value} onValueChange={setValue} groups={GROUPS} onSelect={() => undefined} />
  );
}
