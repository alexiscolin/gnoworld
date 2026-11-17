// The account that asks a link signs its text too (the wallet audit's medium 1): with Adena switched back to it, or with its
// command-line key's file. A session alone, relayed by a look-alike site, then links nothing.
import { shortAddress, type Address } from "@gnoworld/schemas";
import { Button, Cluster, Disclosure, Stack } from "@gnoworld/ui";
import { useState } from "react";
import { fileShape, type ByProof } from "../../lib/api/links.ts";
import { reportedOr } from "../../lib/reported.ts";
import { WORDS } from "../errors/index.ts";
import { sayProblem } from "../login/index.ts";
import { Block } from "./CommandParts.tsx";

const wallet = () => reportedOr(import("../../lib/adena/adena.ts"), undefined);

// Adena's signature of the text as `me`, or the words of why there is none.
async function signAsMe(me: Address, code: { text: string; chainId: string }): Promise<ByProof | string> {
  const adena = await wallet();
  if (adena === undefined) return WORDS["new-version"].short;
  const { signLogin, connect, pageAdena } = adena;
  const signed = await signLogin(pageAdena(), { address: me, chainId: code.chainId, text: code.text });
  if (signed.ok) return { proof: signed.proof };
  const on = signed.reason === "mismatch" ? await connect(pageAdena()) : undefined;
  return on?.ok === true
    ? `Adena is on ${shortAddress(on.address)}, not ${shortAddress(me)}. Switch it, then sign.`
    : sayProblem(signed);
}

// Sign in Adena and what came of it, a status line held hidden while empty.
function AdenaWay({ solid, busy, said, onSign }: { solid: boolean; busy: boolean; said: string; onSign: () => void }) {
  return (
    <Cluster space="xs">
      <Button emphasis={solid ? "solid" : "outline"} busy={busy} onClick={onSign}>
        Sign in Adena
      </Button>
      <p role="status" className={said === "" ? "visually-hidden" : undefined}>
        {said}
      </p>
    </Cluster>
  );
}

/** `me`'s own proof of the code's text, handed on as it comes: Adena's, or a file of the tool's shape; undefined while there is none.
 * The tab's own way first, the other behind its fold: Adena's in the Adena tab, the key's block in the command line's, where a phone
 * never goes (PR #41's UX review). `step` numbers its label among the tab's steps. */
export function AsMe({
  me,
  code,
  first,
  step,
  next,
  onBy,
}: {
  me: Address;
  code: { text: string; byBlock: string; chainId: string };
  first: "adena" | "file";
  step?: number;
  /** Its Adena way is the next act: solid. */
  next: boolean;
  onBy: (by: ByProof | undefined) => void;
}) {
  const [file, setFile] = useState("");
  const [said, setSaid] = useState("");
  const [busy, setBusy] = useState(false);
  const sign = async () => {
    setBusy(true);
    const by = await signAsMe(me, code);
    setBusy(false);
    if (typeof by === "string") setSaid(by);
    else {
      setFile("");
      setSaid(`Signed as ${shortAddress(me)}.`);
      onBy(by);
    }
  };
  const adena = (
    <AdenaWay
      solid={next && first === "adena"}
      busy={busy}
      said={said}
      onSign={() => {
        sign().catch(reportError);
      }}
    />
  );
  const key = (
    <Block
      block={code.byBlock}
      help={`Signs the same text offline with the key of ${shortAddress(me)}.`}
      file={file}
      run="Run in a terminal"
      paste="Paste what your own key's command printed"
      onFile={(text) => {
        setFile(text);
        onBy(fileShape(text) ? { file: text } : undefined);
      }}
    />
  );
  const label = `${step === undefined ? "" : `${String(step)} · `}Sign as yourself · ${shortAddress(me)}`;
  return first === "file" ? (
    <Stack space="m">
      <p className="label">{label}</p>
      {key}
      <Disclosure title="Or sign in Adena" size="s">
        <Stack space="2xs">
          <p className="meta">Switch Adena to this account first.</p>
          {adena}
        </Stack>
      </Disclosure>
    </Stack>
  ) : (
    <Stack space="xs">
      <Stack space="2xs">
        <p className="label">{label}</p>
        <p className="meta">Switch Adena to this account, then sign the same text.</p>
      </Stack>
      {adena}
      <div className="fine-only">
        <Disclosure title="Or sign with gnokey" size="s">
          <Stack space="m">{key}</Stack>
        </Disclosure>
      </div>
    </Stack>
  );
}
