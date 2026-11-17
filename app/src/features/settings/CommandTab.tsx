// The command-line way to link a key or to release one (D13880): the address, the block the server composed (shown as it came,
// never built here), the file the tool wrote pasted back. A code lives its flow's time, once; a refusal brings a new code at once.
import { Address, shortAddress } from "@gnoworld/schemas";
import { Disclosure, Stack } from "@gnoworld/ui";
import { useState } from "react";
import type { ReactNode } from "react";
import { pageLinksApi, type ByProof } from "../../lib/api/links.ts";
import { AsMe } from "./AsMe.tsx";
import { AddressBox, blocked, Block, EndGroup, Submit } from "./CommandParts.tsx";
import { ask, asMeOf, link, proofOf, unsigned, type Code, type Flow, type Say, type Step } from "./commandSteps.ts";
import { Linked, Stale } from "./LinkStates.tsx";
import { useSignInAgain } from "./useSignInAgain.ts";

// The steps a code brings: the block to run and the box to paste into, the logged-in account's own signature for a link, and what the
// command signs, on demand.
function CodeSteps({
  code,
  address,
  paste,
  mine,
  signed,
}: {
  code: Code;
  address: string;
  paste: { file: string; onFile: (file: string) => void; error: string };
  mine: ReturnType<typeof asMeOf>;
  signed: { by: ByProof | undefined; onBy: (by: ByProof | undefined) => void };
}) {
  // Numbered as Get started numbers its steps, what the command signs said under its block, before the paste (PR #41's UX review).
  return (
    <>
      <Block
        block={code.block}
        help={`Signs offline with the key of ${address}, for a chain that does not exist: it cannot move funds.`}
        run="2 · Run in a terminal"
        paste="3 · Paste what it printed"
        focus
        about={
          <Disclosure title="What does the command sign?" size="s">
            <p className="meta">
              A transaction for a chain that does not exist, so it can never be sent; it would only move 1 ugnot from
              the key to itself. The code works once, for this site and this account.
            </p>
          </Disclosure>
        }
        {...paste}
      />
      {mine === undefined ? null : (
        <AsMe
          key={mine.code.text}
          me={mine.me}
          code={mine.code}
          first="file"
          step={4}
          next={signed.by === undefined && paste.file.trim() !== ""}
          onBy={signed.onBy}
        />
      )}
    </>
  );
}

// The pasted file and its own error, which a new paste clears.
function usePaste() {
  const [file, setFile] = useState("");
  const [error, setError] = useState("");
  const onFile = (next: string) => {
    setFile(next);
    setError("");
  };
  return { file, error, setFile, setError, onFile };
}

function CommandFlow({
  flow,
  onDone,
  onCancel,
  done,
  me,
}: {
  flow: Flow;
  onDone: (address: Address) => void;
  onCancel: () => void;
  done: (address: Address) => ReactNode;
  /** A link's: the logged-in account, which signs the code's text too (the wallet audit's medium 1). */
  me?: Address;
}) {
  const [typed, setTyped] = useState("");
  const { file, error, setFile, setError, onFile } = usePaste();
  // The logged-in account's own proof, with the text it signed: a proof of a code a new one replaced never counts.
  const [signed, setSigned] = useState<{ text: string; by: ByProof } | undefined>(undefined);
  const [step, setStep] = useState<Step>({ at: "idle" });
  const [said, setSaid] = useState("");
  const parsed = Address.safeParse(typed.trim());
  const ready = step.at === "ready" ? step : undefined;
  const say: Say = { flow, step: setStep, said: setSaid, file: setFile, error: setError };
  const mine = asMeOf(me, ready);
  const by = proofOf(mine, signed);
  const get = (why = "") => {
    if (parsed.success) ask(parsed.data, why, say).catch(reportError);
  };
  const again = useSignInAgain(get);

  if (step.at === "done") return done(step.address);
  if (step.at === "stale") return <Stale again={again} />;
  return (
    <Stack space="m">
      <AddressBox
        label={`1 · ${flow.address}`}
        typed={typed}
        valid={parsed.success}
        onChange={(next) => {
          setTyped(next);
          setStep({ at: "idle" });
        }}
      />
      {ready === undefined || !parsed.success ? null : (
        <CodeSteps
          code={ready.code}
          address={shortAddress(parsed.data)}
          paste={{ file, error, onFile }}
          mine={mine}
          signed={{
            by,
            onBy: (next) => {
              setSigned(next === undefined || mine === undefined ? undefined : { text: mine.code.text, by: next });
            },
          }}
        />
      )}
      <EndGroup
        said={said}
        submit={
          <Submit
            ready={ready}
            asking={step.at === "asking"}
            verb={flow.verb}
            emphasis={unsigned(mine, by) ? "outline" : "solid"}
            disabled={blocked(parsed.success, step, file) || unsigned(mine, by)}
            onClick={() => {
              if (ready === undefined) get();
              else if (parsed.success)
                link({ code: ready.code, address: parsed.data, file, by }, say, onDone).catch(reportError);
            }}
          />
        }
        onCancel={onCancel}
        code={ready === undefined ? undefined : { nonce: ready.code.nonce, seconds: flow.seconds }}
        onExpired={() => {
          get("This code expired. Here is a new one.");
        }}
      />
    </Stack>
  );
}

const LINK_FLOW: Flow = {
  kind: "link",
  verb: "Link",
  address: "Address to link",
  seconds: 600,
  challenge: (address) => pageLinksApi().cliChallenge(address),
  // Never sent without the account's own proof: Link waits for it.
  verify: ({ by, ...request }) =>
    by === undefined
      ? Promise.resolve({ ok: false, reason: "refused" })
      : pageLinksApi().verifyFile({ ...request, by }),
};
const RELEASE_FLOW: Flow = {
  kind: "release",
  verb: "Release",
  address: "Address of the key",
  seconds: 600,
  challenge: (address) => pageLinksApi().releaseChallenge(address),
  verify: (request) => pageLinksApi().releaseVerify(request),
};

/** The tab that links a command-line key, `me` signing the same text. */
export function CommandTab({ me, onLinked, onCancel }: { me: Address; onLinked: () => void; onCancel: () => void }) {
  return (
    <CommandFlow
      flow={LINK_FLOW}
      me={me}
      onDone={onLinked}
      onCancel={onCancel}
      done={(address) => <Linked address={address} />}
    />
  );
}

/** The release of a command-line key, with no session: what is said never tells whether the key was linked. */
export function ReleaseFlow({ onCancel }: { onCancel: () => void }) {
  return (
    <CommandFlow
      flow={RELEASE_FLOW}
      onDone={() => undefined}
      onCancel={onCancel}
      done={(address) => (
        <p role="status">Done. If {shortAddress(address)} was linked to a gnoworld account, it no longer is.</p>
      )}
    />
  );
}
