// The overview's combobox, holding what is typed as a page's does, and its select.
import { useState } from "react";
import { Combobox } from "../Combobox/Combobox.tsx";
import { FieldWords } from "../Field/FieldWords.tsx";
import { Select } from "../Field/Select.tsx";
import { Listbox } from "../Listbox/Listbox.tsx";

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
      <FieldWords id="sample" label="Message #games" help="1 byte left." />
      <Listbox
        label="Suggestions"
        id="sample-list"
        active={0}
        onPick={() => undefined}
        options={[{ id: "sample-list-0", label: "/me", hint: "Send an action: /me waves" }]}
      />
      <Select label="Your country" value="JP" onChange={() => undefined} options={COUNTRIES} />
    </>
  );
}
