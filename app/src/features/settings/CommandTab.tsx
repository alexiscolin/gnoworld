// The command-line way to link a key, or to release one (owners' moderation, part 5; D13940): the address, the block the server composed (shown as it came, never built here),
// the file the tool wrote pasted back. A code lives 10 minutes, once; a refusal brings a new code at once, the block filled again.
import { Address, shortAddress } from "@gnoworld/schemas";
import { Button, Cluster, Stack } from "@gnoworld/ui";
import { useState } from "react";
import type { ReactNode } from "react";
import { fileShape, pageLinksApi, type CliChallenge } from "../../lib/api/links.ts";
import type { Result } from "../../lib/api/http.ts";
import { AddressBox, blocked, Block, CodeNote, Submit } from "./CommandParts.tsx";
import { Linked, Stale } from "./LinkStates.tsx";
import { notSigned, PASTE_SHAPE, refusalWords } from "./linkWords.ts";
import { useSignInAgain } from "./useSignInAgain.ts";

type Step =
  | { at: "idle" }
  | { at: "asking" }
  | { at: "ready"; code: CliChallenge; checking?: true }
  | { at: "stale" }
  | { at: "done"; address: Address };
/** The two calls of a flow: a link's (with a session) or a release's (with none). */
interface Flow {
  kind: "link" | "release";
  challenge: (address: Address) => Promise<Result<CliChallenge>>;
  verify: (request: { nonce: string; address: Address; file: string }) => Promise<Result<unknown>>;
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

// The pasted file posted; a refusal gets a new code at once.
async function link(request: { code: CliChallenge; address: Address; file: string }, say: Say, onLinked: () => void) {
  const { code, address, file } = request;
  if (!fileShape(file)) {
    say.said(PASTE_SHAPE);
    return;
  }
  say.step({ at: "ready", code, checking: true });
  const done = await say.flow.verify({ nonce: code.nonce, address, file });
  if (done.ok) {
    say.step({ at: "done", address });
    onLinked();
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

function CommandFlow({
  flow,
  onDone,
  onCancel,
  done,
}: {
  flow: Flow;
  onDone: () => void;
  onCancel: () => void;
  done: (address: Address) => ReactNode;
}) {
  const [typed, setTyped] = useState("");
  const [file, setFile] = useState("");
  const [step, setStep] = useState<Step>({ at: "idle" });
  const [said, setSaid] = useState("");
  const parsed = Address.safeParse(typed.trim());
  const ready = step.at === "ready" ? step : undefined;
  const say: Say = { flow, step: setStep, said: setSaid, file: setFile };
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
      {ready === undefined ? null : <Block code={ready.code} file={file} onFile={setFile} onCopied={setSaid} />}
      <p role="status" className="meta">
        {said}
      </p>
      <Cluster justify="end">
        <Button onClick={onCancel}>Cancel</Button>
        <Submit
          ready={ready}
          disabled={blocked(parsed.success, step, file)}
          onClick={() => {
            if (ready === undefined) get();
            else if (parsed.success)
              link({ code: ready.code, address: parsed.data, file }, say, onDone).catch(reportError);
          }}
        />
      </Cluster>
      {ready === undefined ? null : (
        <CodeNote
          key={ready.code.nonce}
          onExpired={() => {
            get("This code expired. Here is a new one.");
          }}
        />
      )}
    </Stack>
  );
}

const LINK_FLOW: Flow = {
  kind: "link",
  challenge: (address) => pageLinksApi().cliChallenge(address),
  verify: (request) => pageLinksApi().verifyFile(request),
};
const RELEASE_FLOW: Flow = {
  kind: "release",
  challenge: (address) => pageLinksApi().releaseChallenge(address),
  verify: (request) => pageLinksApi().releaseVerify(request),
};

/** The tab that links a command-line key. */
export function CommandTab({ onLinked, onCancel }: { onLinked: () => void; onCancel: () => void }) {
  return (
    <CommandFlow
      flow={LINK_FLOW}
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
