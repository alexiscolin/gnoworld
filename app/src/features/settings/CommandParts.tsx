// The pieces of the command-line flow that only draw: the address, the block to run and the box to paste into, the button, the code's clock.
// Each is a step of the flow's Stack, the content's edges shared (the UX pass).
import { Button, Cluster, Field, Stack } from "@gnoworld/ui";
import { useEffect, useEffectEvent, type ReactNode } from "react";
import { CodeBlock } from "../../CodeBlock.tsx";
import { clock, useCountdown } from "./useCountdown.ts";

const PLACEHOLDER = '{"msg":[…],"fee":…,"signatures":[{"pub_key":…,"signature":…}],"memo":"…"}';

// Two steps: the block to run, its help naming whose key KEY is, then the box to paste into, named `paste`, with its own error.
export function Block({
  block,
  help,
  file,
  onFile,
  error = "",
  paste = "Paste what it shows",
}: {
  block: string;
  help: string;
  file: string;
  onFile: (file: string) => void;
  error?: string;
  paste?: string;
}) {
  return (
    <>
      <Stack space="2xs">
        <p className="label">Run in a terminal</p>
        <CodeBlock text={block} help={help} />
      </Stack>
      <Field
        kind="lines"
        label={paste}
        value={file}
        onChange={onFile}
        placeholder={PLACEHOLDER}
        {...(error === "" ? {} : { error })}
      />
    </>
  );
}

// Nothing to press without an address, or with nothing pasted under a code; a code asked or a file checked is the button's busy.
export const blocked = (valid: boolean, step: { at: string }, file: string) =>
  !valid || (step.at === "ready" && file.trim() === "");

// Get a code, then the flow's verb; its own words while the server checks, pressed and still in reach while it waits. Outline while the
// next act is elsewhere (a link waiting for the logged-in account's own signature).
export function Submit({
  ready,
  asking,
  disabled,
  onClick,
  verb,
  emphasis,
}: {
  ready: { checking?: true } | undefined;
  asking: boolean;
  disabled: boolean;
  onClick: () => void;
  verb: string;
  emphasis: "solid" | "outline";
}) {
  return (
    <Button emphasis={emphasis} busy={asking || ready?.checking === true} disabled={disabled} onClick={onClick}>
      {ready === undefined ? "Get a code" : ready.checking === true ? "Checking…" : verb}
    </Button>
  );
}

// The fine print under the buttons, with the code's clock, counted from its arrival (the page trusts no clock but its own); it asks for a new
// code when the time is up. Keyed by the code, so each starts at its flow's `seconds`.
function CodeNote({ seconds, onExpired }: { seconds: number; onExpired: () => void }) {
  const left = useCountdown(seconds);
  const expired = useEffectEvent(onExpired);
  useEffect(() => {
    if (left === 0) expired();
  }, [left]);
  return <p className="meta">{`Nothing is sent to the chain. The code works once, for ${clock(left)} more.`}</p>;
}

export function AddressBox({
  label,
  typed,
  valid,
  onChange,
}: {
  label: string;
  typed: string;
  valid: boolean;
  onChange: (typed: string) => void;
}) {
  return (
    <Field
      label={label}
      value={typed}
      onChange={onChange}
      placeholder="g1…"
      {...(typed !== "" && !valid ? { error: "This is not a gno address: it starts with g1." } : {})}
    />
  );
}

// The flow's end: the status line (held hidden while empty, so it takes no gap), the main button then Cancel at the content's start, and the
// fine print under them, with the code's clock once there is a code.
export function EndGroup({
  said,
  submit,
  onCancel,
  code,
  onExpired,
}: {
  said: string;
  submit: ReactNode;
  onCancel: () => void;
  code: { nonce: string; seconds: number } | undefined;
  onExpired: () => void;
}) {
  return (
    <Stack space="xs">
      <p role="status" className={said === "" ? "visually-hidden" : undefined}>
        {said}
      </p>
      <Cluster space="2xs">
        {submit}
        <Button onClick={onCancel}>Cancel</Button>
      </Cluster>
      {code === undefined ? (
        <p className="meta">Nothing is sent to the chain.</p>
      ) : (
        <CodeNote key={code.nonce} seconds={code.seconds} onExpired={onExpired} />
      )}
    </Stack>
  );
}
