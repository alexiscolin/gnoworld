// Whether an account's lines say where it speaks from (ADR-0001 §7), in the room's menu: off until the person chooses, the time zone, read
// only once they ask, a suggestion they confirm. An account's, so the table of countries is never a visitor's first screen.
import { COUNTRIES, countryName } from "@gnoworld/core/bubbles";
import type { Address } from "@gnoworld/schemas";
import { Chip, Select, Stack } from "@gnoworld/ui";
import { useEffect, useRef, useState } from "react";
import { keepCountry, keptCountry, zoneCountry } from "./accountKit.ts";

interface ListProps {
  country: string | undefined;
  onChoose: (code: string | undefined) => void;
  /** Whether it opened at the person's asking, the control they asked from gone: the focus comes here. */
  asked: boolean;
}

// The list by name, and what the time zone suggests while nothing is chosen.
function CountryList({ country, onChoose, asked }: ListProps) {
  const listRef = useRef<HTMLSelectElement>(null);
  const [options] = useState(() => [
    { value: "", label: "No country" },
    ...COUNTRIES.toSorted((a, b) => a.name.localeCompare(b.name)).map(({ code, name }) => ({
      value: code,
      label: name,
    })),
  ]);
  const [suggested] = useState(() => zoneCountry(COUNTRIES));
  useEffect(() => {
    if (asked) listRef.current?.focus();
  }, [asked]);
  return (
    <>
      <Select
        ref={listRef}
        label="Your country"
        value={country ?? ""}
        options={options}
        onChange={(code) => {
          onChoose(code === "" ? undefined : code);
        }}
      />
      {country === undefined && suggested !== undefined ? (
        <>
          <Chip
            onClick={() => {
              onChoose(suggested.code);
            }}
          >{`Use ${suggested.name}`}</Chip>
          <p>From your time zone. Nothing shows until you choose it.</p>
        </>
      ) : null}
    </>
  );
}

const wordsOf = (name: string | undefined) =>
  name === undefined
    ? "Your messages show no country."
    : `Your new messages in public rooms show ${name} to anyone who reads them. Messages already sent keep theirs.`;

function Choice({ account }: { account: Address }) {
  const [country, setCountry] = useState(() => keptCountry(account));
  const [asked, setAsked] = useState(false);
  // A list opened on a choice stays when the choice is taken back: the control the person is on does not go from under them.
  const [chosen] = useState(country !== undefined);
  const [notKept, setNotKept] = useState(false);
  const choose = (code: string | undefined) => {
    const kept = keepCountry(account, code);
    setNotKept(!kept);
    if (kept) setCountry(code);
  };
  return (
    <Stack space="3xs">
      <p className="label">Your country</p>
      {chosen || asked ? (
        <CountryList country={country} onChoose={choose} asked={asked} />
      ) : (
        <Chip
          onClick={() => {
            setAsked(true);
          }}
        >
          Choose a country
        </Chip>
      )}
      <p role="status">{wordsOf(countryName(country))}</p>
      {notKept ? <p>Not kept on this device</p> : null}
    </Stack>
  );
}

/** The choice of the account logged in: the next account starts from its own. */
export function CountryChoice({ account }: { account: Address }) {
  return <Choice key={account} account={account} />;
}
