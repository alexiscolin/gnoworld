// The Adena way to link an account (owners' moderation, part 5): Adena is switched to the account to link, the server's text is shown in words,
// Adena signs it for that account, and the server answers with the identity's members. Adena's own answer for a wrong account is told with the
// account it is on.
import { shortAddress, type Address, type Challenge } from "@gnoworld/schemas";
import { Button, Cluster, Stack } from "@gnoworld/ui";
import { useState } from "react";
import { pageLinksApi } from "../../lib/api/links.ts";
import { sayProblem } from "../login/index.ts";
import { Linked, Stale } from "./LinkStates.tsx";
import { LINKED_ELSEWHERE, linkProblem, notSigned } from "./linkWords.ts";
import { useSignInAgain } from "./useSignInAgain.ts";
import styles from "./Settings.module.css";

interface Ready {
  at: "ready";
  address: Address;
  chainId: string;
  challenge: Challenge;
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

// Adena's calls are the page's own, loaded with the first wallet gesture (LoginControl.tsx).
const wallet = () => import("../../lib/adena/adena.ts");
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
  const { connect, pageAdena } = await wallet();
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

// Has Adena sign the server's text for the account chosen, then posts the proof.
async function sign({ address, chainId, challenge }: Ready, set: SetStep, onLinked: () => void): Promise<void> {
  set({ at: "ready", address, chainId, challenge, waiting: true });
  const { signLogin, connect, pageAdena } = await wallet();
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
  const done = await pageLinksApi().verifyAdena({ nonce: challenge.nonce, address, proof: signed.proof });
  set(done.ok ? { at: "linked", address } : refusedVerify(done.reason, address));
  if (done.ok) onLinked();
}

const statusOf = (step: Exclude<Step, { at: "stale" | "linked" }>): string =>
  step.at === "busy"
    ? step.doing
    : step.at === "ready" && step.waiting === true
      ? "Waiting for Adena…"
      : (step.said ?? "");

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
  const busy = step.at === "busy" || ready?.waiting === true;
  const status = statusOf(step);
  return (
    <Stack space="s">
      <p>Switch to the account you want to link in Adena, then continue. Nothing is sent until you press Sign.</p>
      {ready === undefined ? null : (
        <Stack space="2xs">
          <span className="label">Adena will sign this text, for {shortAddress(ready.address)}</span>
          <blockquote className={[styles["block"], "fill-box", "data-text"].join(" ")}>
            {ready.challenge.text}
          </blockquote>
        </Stack>
      )}
      <p role="status" className="meta">
        {status}
      </p>
      <Cluster justify="end">
        <Button onClick={onCancel}>Cancel</Button>
        <Button
          emphasis="solid"
          disabled={busy}
          onClick={() => {
            if (ready === undefined) begin();
            else sign(ready, setStep, onLinked).catch(reportError);
          }}
        >
          {ready === undefined ? "Continue" : "Sign in Adena"}
        </Button>
      </Cluster>
    </Stack>
  );
}
