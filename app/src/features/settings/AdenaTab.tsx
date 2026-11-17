// The Adena way to link an account: Adena is switched to the account to link, the server's text is shown in words,
// Adena signs it for that account, the logged-in account signs it too (AsMe), and the server answers with the identity's members. Adena's own
// answer for a wrong account is told with the account it is on.
import { shortAddress, type Address, type Proof } from "@gnoworld/schemas";
import { Button, Stack } from "@gnoworld/ui";
import { useState } from "react";
import { pageLinksApi, type AdenaChallenge, type ByProof } from "../../lib/api/links.ts";
import { reportedOr } from "../../lib/reported.ts";
import { WORDS } from "../errors/index.ts";
import { sayProblem } from "../login/index.ts";
import { Linked, Stale } from "./LinkStates.tsx";
import { AsMe } from "./AsMe.tsx";
import { EndGroup } from "./CommandParts.tsx";
import { LINKED_ELSEWHERE, linkProblem, notSigned } from "./linkWords.ts";
import { useSignInAgain } from "./useSignInAgain.ts";
import code from "../../CodeBlock.module.css";

interface Ready {
  at: "ready";
  address: Address;
  chainId: string;
  challenge: AdenaChallenge;
  // The account's proof, kept until the logged-in account's own comes, and that one.
  proof?: Proof;
  by?: ByProof | undefined;
  said?: string;
  waiting?: true;
}
type Step =
  | { at: "idle"; said?: string }
  | { at: "busy"; doing: string }
  | Ready
  | { at: "stale" }
  | { at: "linked"; address: Address };
type SetStep = (step: Step) => void;

// Adena's calls are the page's own, loaded with the first wallet gesture (LoginControl.tsx); none when their code cannot be fetched.
const wallet = () => reportedOr(import("../../lib/adena/adena.ts"), undefined);
const STALE_CODE = WORDS["new-version"].short;
const refusedWith = (reason: Parameters<typeof linkProblem>[0]): Step =>
  reason === "unauthenticated" ? { at: "stale" } : { at: "idle", said: linkProblem(reason) };
// A verify's refusals by cause: the code is spent by then, a new one comes with the next Continue.
const refusedVerify = (reason: Parameters<typeof linkProblem>[0], address: Address): Step => {
  if (reason === "not_found") return { at: "idle", said: "This code expired. Press Continue for a new one." };
  if (reason === "refused")
    return { at: "idle", said: `${notSigned("adena", shortAddress(address))} Press Continue for a new code.` };
  if (reason === "forbidden") return { at: "idle", said: LINKED_ELSEWHERE };
  return refusedWith(reason);
};
const SAME = "Adena is on the account you are logged in as. Switch to the account to link in Adena, then continue.";

// Reads the account Adena is on, and asks the server for a code to link it.
async function start(me: Address, set: SetStep): Promise<void> {
  set({ at: "busy", doing: "Reading the account Adena is on…" });
  const adena = await wallet();
  if (adena === undefined) {
    set({ at: "idle", said: STALE_CODE });
    return;
  }
  const { connect, pageAdena } = adena;
  const found = await connect(pageAdena());
  if (!found.ok) set({ at: "idle", said: sayProblem(found) });
  else if (found.address === me) set({ at: "idle", said: SAME });
  else {
    const made = await pageLinksApi().adenaChallenge(found.address);
    if (!made.ok) set(refusedWith(made.reason));
    else if (made.value.chainId !== found.chainId)
      set({ at: "idle", said: `Switch Adena to ${made.value.chainId}, then continue.` });
    else set({ at: "ready", address: found.address, chainId: found.chainId, challenge: made.value });
  }
}

// Has Adena sign the server's text for the account chosen, and keeps the proof for the logged-in account's own.
async function sign({ address, chainId, challenge }: Ready, set: SetStep): Promise<void> {
  set({ at: "ready", address, chainId, challenge, waiting: true });
  const adena = await wallet();
  if (adena === undefined) {
    set({ at: "ready", address, chainId, challenge, said: STALE_CODE });
    return;
  }
  const { signLogin, connect, pageAdena } = adena;
  const signed = await signLogin(pageAdena(), { address, chainId, text: challenge.text });
  if (!signed.ok) {
    const on = signed.reason === "mismatch" ? await connect(pageAdena()) : undefined;
    const said =
      on?.ok === true
        ? `Adena is on ${shortAddress(on.address)}, not the account you chose (${shortAddress(address)}). Switch it, then sign.`
        : sayProblem(signed);
    set({ at: "ready", address, chainId, challenge, said });
    return;
  }
  set({ at: "ready", address, chainId, challenge, proof: signed.proof });
}

// Posts both proofs.
async function finish(ready: Ready & { proof: Proof; by: ByProof }, set: SetStep, onLinked: () => void): Promise<void> {
  const { address, challenge, proof, by } = ready;
  set({ ...ready, waiting: true });
  const done = await pageLinksApi().verifyAdena({ nonce: challenge.nonce, address, proof, by });
  set(done.ok ? { at: "linked", address } : refusedVerify(done.reason, address));
  if (done.ok) onLinked();
}

// The one button's words, and whether it waits: for Adena, the server, or the logged-in account's own proof.
const labelOf = (ready: Ready | undefined): string =>
  ready === undefined ? "Continue" : ready.proof === undefined ? "Sign in Adena" : "Link";
// Pressed while Adena or the server is asked; outline and shut while the next act is the logged-in account's own signature (AsMe's).
const busyOf = (step: Step): boolean => step.at === "busy" || (step.at === "ready" && step.waiting === true);
const waitsForMe = (ready: Ready | undefined): boolean => ready?.proof !== undefined && ready.by === undefined;

const statusOf = (step: Exclude<Step, { at: "stale" | "linked" }>): string =>
  step.at === "busy"
    ? step.doing
    : step.at === "ready" && step.waiting === true
      ? step.proof === undefined
        ? "Waiting for Adena…"
        : "Checking…"
      : (step.said ?? "");

// The text the account to link signs, and once it has, that it did (PR #41's UX review).
function ToSign({ ready }: { ready: Ready }) {
  return (
    <Stack space="2xs">
      <p className="meta">
        <span className="label">Adena will sign this text, for</span>{" "}
        <span className="data-text nowrap">{shortAddress(ready.address)}</span>
      </p>
      <blockquote className={[code["block"], "fill-box", "data-text"].join(" ")}>{ready.challenge.text}</blockquote>
      {ready.proof === undefined ? null : <p className="meta">Signed by {shortAddress(ready.address)}.</p>}
    </Stack>
  );
}

export function AdenaTab({ me, onLinked, onCancel }: { me: Address; onLinked: () => void; onCancel: () => void }) {
  const [step, setStep] = useState<Step>({ at: "idle" });
  const begin = () => {
    start(me, setStep).catch(reportError);
  };
  const again = useSignInAgain(begin);
  if (step.at === "linked") return <Linked address={step.address} />;
  if (step.at === "stale")
    return (
      <Stale again={again}>
        <p className="meta">Switch Adena back to the account you are logged in as first.</p>
      </Stale>
    );
  const ready = step.at === "ready" ? step : undefined;
  const status = statusOf(step);
  return (
    <Stack space="m">
      {ready === undefined ? <p>Switch Adena to the account you want to link, then continue.</p> : null}
      {ready === undefined ? null : <ToSign ready={ready} />}
      {ready?.proof === undefined ? null : (
        <AsMe
          key={ready.challenge.nonce}
          me={me}
          code={{ text: ready.challenge.text, byBlock: ready.challenge.byBlock, chainId: ready.chainId }}
          first="adena"
          next={ready.by === undefined}
          onBy={(by) => {
            setStep((now) => (now.at === "ready" ? { ...now, by } : now));
          }}
        />
      )}
      <EndGroup
        said={status}
        submit={
          <Button
            emphasis={waitsForMe(ready) ? "outline" : "solid"}
            busy={busyOf(step)}
            disabled={waitsForMe(ready)}
            onClick={() => {
              const { proof, by } = ready ?? {};
              if (ready === undefined) begin();
              else if (proof === undefined) sign(ready, setStep).catch(reportError);
              else if (by !== undefined) finish({ ...ready, proof, by }, setStep, onLinked).catch(reportError);
            }}
          >
            {labelOf(ready)}
          </Button>
        }
        onCancel={onCancel}
        code={undefined}
        note="Nothing is sent until you press Link."
      />
    </Stack>
  );
}
