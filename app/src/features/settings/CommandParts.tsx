// The pieces of the command-line flow that only draw: the block to copy and the box to paste into, the button, the code's clock, the address box.
import { Button, Field, Stack } from "@gnoworld/ui";
import { useEffect, useEffectEvent } from "react";
import type { CliChallenge } from "../../lib/api/links.ts";
import { canCopy } from "../../lib/copy.ts";
import { clock, useCountdown } from "./useCountdown.ts";
import styles from "./Settings.module.css";

const CODE_SECONDS = 600;
const PLACEHOLDER = '{"msg":[…],"fee":…,"signatures":[{"pub_key":…,"signature":…}],"memo":"…"}';

// The block to copy and the box to paste into.
export function Block({
  code,
  file,
  onFile,
  onCopied,
}: {
  code: CliChallenge;
  file: string;
  onFile: (file: string) => void;
  onCopied: (words: string) => void;
}) {
  return (
    <Stack space="2xs">
      <span className="meta">Copy, run in your terminal (KEY is your key's name); nothing is sent</span>
      <div className={styles["code"]}>
        <pre className={[styles["block"], "fill-box", "data-text"].join(" ")} data-scroll="">
          {code.block}
        </pre>
        {canCopy() ? (
          <span className={styles["copy"]}>
            <Button
              size="s"
              onClick={() => {
                navigator.clipboard.writeText(code.block).then(
                  () => {
                    onCopied("Copied");
                  },
                  () => {
                    onCopied("Could not copy the block");
                  },
                );
              }}
            >
              Copy
            </Button>
          </span>
        ) : null}
      </div>
      <Field kind="lines" label="Paste what it shows" value={file} onChange={onFile} placeholder={PLACEHOLDER} />
    </Stack>
  );
}

// Nothing to press without an address, while a code is asked for, or with nothing pasted under a code.
export const blocked = (valid: boolean, step: { at: string }, file: string) =>
  !valid || step.at === "asking" || (step.at === "ready" && file.trim() === "");

// Get a code, then Link; the Link's own words while the server checks.
export function Submit({
  ready,
  disabled,
  onClick,
}: {
  ready: { checking?: true } | undefined;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <Button emphasis="solid" disabled={disabled || ready?.checking === true} onClick={onClick}>
      {ready === undefined ? "Get a code" : ready.checking === true ? "Checking…" : "Link"}
    </Button>
  );
}

// How long the code works, counted from its arrival (the page trusts no clock but its own), and what the signature is for; it asks for a new code
// when the time is up. Keyed by the code, so each starts at ten minutes.
export function CodeNote({ onExpired }: { onExpired: () => void }) {
  const left = useCountdown(CODE_SECONDS);
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
