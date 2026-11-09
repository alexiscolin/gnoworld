// Where an account's lines say it speaks from (ADR-0001 §7, D395), in the room's menu: its time zone's country by default, another it
// chooses, or none once it hides it. An account's, so the table of countries is never a visitor's first screen.
import { COUNTRIES, countryName } from "@gnoworld/core/bubbles";
import type { Address } from "@gnoworld/schemas";
import { Select } from "@gnoworld/ui";
import { useState } from "react";
import { keepCountry, shownCountry } from "./accountKit.ts";
import { Setting } from "./RoomMenu.tsx";

interface ListProps {
  country: string | undefined;
  onChoose: (code: string | undefined) => void;
}

// The list by name, hiding first.
function CountryList({ country, onChoose }: ListProps) {
  const [options] = useState(() => [
    { value: "", label: "Hide my country" },
    ...COUNTRIES.toSorted((a, b) => a.name.localeCompare(b.name)).map(({ code, name }) => ({
      value: code,
      label: name,
    })),
  ]);
  return (
    <Select
      label="Your country"
      value={country ?? ""}
      options={options}
      onChange={(code) => {
        onChoose(code === "" ? undefined : code);
      }}
    />
  );
}

const wordsOf = (name: string | undefined) =>
  name === undefined
    ? "Your messages show no country."
    : `Shown on your new messages in public rooms, set from your time zone until you pick one. Sent messages keep theirs.`;

function Choice({ account }: { account: Address }) {
  const [country, setCountry] = useState(() => shownCountry(account, COUNTRIES));
  const [notKept, setNotKept] = useState(false);
  const choose = (code: string | undefined) => {
    const kept = keepCountry(account, code);
    setNotKept(!kept);
    if (kept) setCountry(code);
  };
  return (
    <Setting
      label="Your country"
      help={
        <>
          <p role="status">{wordsOf(countryName(country))}</p>
          {notKept ? <p>Not kept on this device</p> : null}
        </>
      }
    >
      <CountryList country={country} onChoose={choose} />
    </Setting>
  );
}

/** The choice of the account logged in: the next account starts from its own. */
export function CountryChoice({ account }: { account: Address }) {
  return <Choice key={account} account={account} />;
}
