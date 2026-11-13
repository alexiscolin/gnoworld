// The overview's field words, suggestions list and select.
import { FieldWords } from "../Field/FieldWords.tsx";
import { Select } from "../Field/Select.tsx";
import { Listbox } from "../Listbox/Listbox.tsx";

const COUNTRIES = [
  { value: "FR", label: "France" },
  { value: "JP", label: "Japan" },
];

export function FieldParts() {
  return (
    <>
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
