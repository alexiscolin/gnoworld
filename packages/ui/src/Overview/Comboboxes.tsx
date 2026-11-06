// The overview's combobox, holding what is typed as a page's does, and its select.
import { useState } from "react";
import { Combobox } from "../Combobox/Combobox.tsx";
import { Select } from "../Field/Select.tsx";

const GROUPS = [
  { id: "world", label: "Worlds", options: [{ id: "/w/bubble", label: "Bubble" }] },
  { id: "ecosystem", label: "Ecosystems", options: [{ id: "/e/tokens", label: "Tokens" }] },
];
const COUNTRIES = [
  { value: "FR", label: "France" },
  { value: "JP", label: "Japan" },
];

export function Comboboxes() {
  const [value, setValue] = useState("");
  return (
    <>
      <Combobox
        label="Search places"
        value={value}
        onValueChange={setValue}
        groups={GROUPS}
        onSelect={() => undefined}
      />
      <Select label="Your country" value="JP" onChange={() => undefined} options={COUNTRIES} />
    </>
  );
}
