// The pieces of the command-line flow that only draw: the block to copy and the box to paste into, the button, the code's clock, the address box.
import { Button, Field, Stack } from "@gnoworld/ui";
import { useEffect, useEffectEvent } from "react";
import { CodeBlock } from "../../CodeBlock.tsx";
import { clock, useCountdown } from "./useCountdown.ts";

const PLACEHOLDER = '{"msg":[…],"fee":…,"signatures":[{"pub_key":…,"signature":…}],"memo":"…"}';

// The block to copy and the box to paste into: `whose` key the block's KEY names, the box named `paste`.
export function Block({
  block,
  file,
  onFile,
  whose = "your key's",
  paste = "Paste what it shows",
}: {
  block: string;
  file: string;
  onFile: (file: string) => void;
  whose?: string;
  paste?: string;
}) {
  return (
    <Stack space="2xs">
      <span className="meta">{`Copy, run in your terminal (KEY is ${whose} name); nothing is sent`}</span>
      <CodeBlock text={block} />
      <Field kind="lines" label={paste} value={file} onChange={onFile} placeholder={PLACEHOLDER} />
    </Stack>
  );
}

// Nothing to press without an address, while a code is asked for, or with nothing pasted under a code.
export const blocked = (valid: boolean, step: { at: string }, file: string) =>
  !valid || step.at === "asking" || (step.at === "ready" && file.trim() === "");

// Get a code, then the flow's verb; its own words while the server checks.
export function Submit({
  ready,
  disabled,
  onClick,
  verb,
}: {
  ready: { checking?: true } | undefined;
  disabled: boolean;
  onClick: () => void;
  verb: string;
}) {
  return (
    <Button emphasis="solid" disabled={disabled || ready?.checking === true} onClick={onClick}>
      {ready === undefined ? "Get a code" : ready.checking === true ? "Checking…" : verb}
    </Button>
  );
}

// How long the code works, counted from its arrival (the page trusts no clock but its own), and what the signature is for; it asks for a new code
// when the time is up. Keyed by the code, so each starts at its flow's `seconds`.
export function CodeNote({ seconds, onExpired }: { seconds: number; onExpired: () => void }) {
  const left = useCountdown(seconds);
  const expired = useEffectEvent(onExpired);
  useEffect(() => {
    if (left === 0) expired();
  }, [left]);
  return (
    <p className="meta">
      {`The code works once, for ${clock(left)} more, for this site and this account. The signature is for a chain that does not exist, and the transaction sends nothing to anyone but the key itself.`}
    </p>
  );
}

export function AddressBox({
  typed,
  valid,
  onChange,
}: {
  typed: string;
  valid: boolean;
  onChange: (typed: string) => void;
}) {
  return (
    <Field
      label="Address"
      value={typed}
      onChange={onChange}
      {...(typed !== "" && !valid ? { error: "This is not a gno address: it starts with g1." } : {})}
    />
  );
}
