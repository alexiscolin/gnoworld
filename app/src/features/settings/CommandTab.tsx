// The command-line way to link a key, to release one or to log in (D13880): the address, the block the server composed (shown as it came,
// never built here), the file the tool wrote pasted back. A code lives its flow's time, once; a refusal brings a new code at once.
import { Address, shortAddress } from "@gnoworld/schemas";
import { Button, Cluster, Stack } from "@gnoworld/ui";
import { useState } from "react";
import type { ReactNode } from "react";
import { fileShape, pageLinksApi, type ByProof, type CliChallenge } from "../../lib/api/links.ts";
import type { Result } from "../../lib/api/http.ts";
import { AsMe } from "./AsMe.tsx";
import { AddressBox, blocked, Block, CodeNote, Submit } from "./CommandParts.tsx";
import { Linked, Stale } from "./LinkStates.tsx";
import { notSigned, PASTE_SHAPE, refusalWords } from "./linkWords.ts";
import { useSignInAgain } from "./useSignInAgain.ts";

// A link's code also brings the logged-in account's own block and the chain an Adena signature of it is for.
type Code = CliChallenge & { byBlock?: string; chainId?: string };
type Step =
  | { at: "idle" }
  | { at: "asking" }
  | { at: "ready"; code: Code; checking?: true }
  | { at: "stale" }
  | { at: "done"; address: Address };
/** The two calls of a flow: a link's (with a session), a release's or a login's (with none); its button's verb and its code's life. */
export interface Flow {
  kind: "link" | "release" | "login";
  verb: string;
  seconds: number;
  challenge: (address: Address) => Promise<Result<Code>>;
  verify: (request: { nonce: string; address: Address; file: string; by?: ByProof }) => Promise<Result<unknown>>;
}
interface Say {
  flow: Flow;
  step: (step: Step) => void;
  said: (words: string) => void;
  file: (text: string) => void;
}

// A code for the address; `why` says what the last one came to.
async function ask(address: Address, why: string, { flow, step, said, file }: Say): Promise<void> {
  step({ at: "asking" });
  said(why);
  const made = await flow.challenge(address);
  if (made.ok) {
    file("");
    step({ at: "ready", code: made.value });
  } else if (made.reason === "unauthenticated") step({ at: "stale" });
  else {
    step({ at: "idle" });
    said(refusalWords(flow.kind, made.reason));
  }
}

// The pasted file posted, with the logged-in account's own proof for a link; a refusal gets a new code at once.
async function link(
  request: { code: Code; address: Address; file: string; by: ByProof | undefined },
  say: Say,
  onLinked: (address: Address) => void,
) {
  const { code, address, file, by } = request;
  if (!fileShape(file)) {
    say.said(PASTE_SHAPE);
    return;
  }
  say.step({ at: "ready", code, checking: true });
  const done = await say.flow.verify({ nonce: code.nonce, address, file, ...(by === undefined ? {} : { by }) });
  if (done.ok) {
    say.step({ at: "done", address });
    onLinked(address);
  } else if (done.reason === "unauthenticated") say.step({ at: "stale" });
  else if (done.reason === "not_found") await ask(address, "This code expired. Here is a new one.", say);
  else if (done.reason === "refused")
    await ask(address, `${notSigned("cli", shortAddress(address))} Here is a new code.`, say);
  else if (done.reason === "forbidden" || done.reason === "full") {
    say.step({ at: "idle" });
    say.said(refusalWords(say.flow.kind, done.reason));
  } else {
    say.step({ at: "ready", code });
    say.said(refusalWords(say.flow.kind, done.reason));
  }
}

export function CommandFlow({
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
  const [file, setFile] = useState("");
  // The logged-in account's own proof, with the text it signed: a proof of a code a new one replaced never counts.
  const [signed, setSigned] = useState<{ text: string; by: ByProof } | undefined>(undefined);
  const [step, setStep] = useState<Step>({ at: "idle" });
  const [said, setSaid] = useState("");
  const parsed = Address.safeParse(typed.trim());
  const ready = step.at === "ready" ? step : undefined;
  const say: Say = { flow, step: setStep, said: setSaid, file: setFile };
  const mine = asMeOf(me, ready);
  const by = proofOf(mine, signed);
  const get = (why = "") => {
    if (parsed.success) ask(parsed.data, why, say).catch(reportError);
  };
  const again = useSignInAgain(get);

  if (step.at === "done") return done(step.address);
  if (step.at === "stale") return <Stale again={again} />;
  return (
    <Stack space="s">
      <AddressBox
        typed={typed}
        valid={parsed.success}
        onChange={(next) => {
          setTyped(next);
          setStep({ at: "idle" });
        }}
      />
      {ready === undefined ? null : <Block block={ready.code.block} file={file} onFile={setFile} onCopied={setSaid} />}
      {mine === undefined ? null : (
        <AsMe
          key={mine.code.text}
          me={mine.me}
          code={mine.code}
          onBy={(next) => {
            setSigned(next === undefined ? undefined : { text: mine.code.text, by: next });
          }}
        />
      )}
      <p role="status" className="meta">
        {said}
      </p>
      <Cluster justify="end">
        <Button onClick={onCancel}>Cancel</Button>
        <Submit
          ready={ready}
          verb={flow.verb}
          disabled={blocked(parsed.success, step, file) || unsigned(mine, by)}
          onClick={() => {
            if (ready === undefined) get();
            else if (parsed.success)
              link({ code: ready.code, address: parsed.data, file, by }, say, onDone).catch(reportError);
          }}
        />
      </Cluster>
      {ready === undefined ? null : (
        <CodeNote
          key={ready.code.nonce}
          seconds={flow.seconds}
          onExpired={() => {
            get("This code expired. Here is a new one.");
          }}
        />
      )}
    </Stack>
  );
}

// A link's ready code: the logged-in account and what `AsMe` needs of the code; a release's and a login's have none.
function asMeOf(me: Address | undefined, ready: { code: Code } | undefined) {
  if (me === undefined || ready === undefined) return undefined;
  const { memo: text, byBlock, chainId } = ready.code;
  return byBlock === undefined || chainId === undefined ? undefined : { me, code: { text, byBlock, chainId } };
}
// A link waits for the logged-in account's own proof, of this code's text.
const unsigned = (mine: unknown, by: ByProof | undefined): boolean => mine !== undefined && by === undefined;
const proofOf = (mine: { code: { text: string } } | undefined, signed: { text: string; by: ByProof } | undefined) =>
  mine !== undefined && signed?.text === mine.code.text ? signed.by : undefined;

const LINK_FLOW: Flow = {
  kind: "link",
  verb: "Link",
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
  verb: "Link",
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
