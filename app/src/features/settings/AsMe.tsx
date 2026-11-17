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

/** `me`'s own proof of the code's text, handed on as it comes: Adena's, or a file of the tool's shape; undefined while there is none.
 * Adena's way first, solid until `signed`; the gnokey way behind its fold (the UX pass). */
export function AsMe({
  me,
  code,
  signed,
  onBy,
}: {
  me: Address;
  code: { text: string; byBlock: string; chainId: string };
  signed: boolean;
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
  return (
    <Stack space="xs">
      <Stack space="2xs">
        <p className="label">Your own signature</p>
        <p>Switch Adena to {shortAddress(me)}, the account you are logged in as, and sign the same text.</p>
      </Stack>
      <Cluster space="xs">
        <Button
          emphasis={signed ? "outline" : "solid"}
          busy={busy}
          onClick={() => {
            sign().catch(reportError);
          }}
        >
          Sign in Adena
        </Button>
        <p role="status" className={said === "" ? "visually-hidden" : undefined}>
          {said}
        </p>
      </Cluster>
      <Disclosure title="Or sign with gnokey" size="s">
        <Stack space="m">
          <Block
            block={code.byBlock}
            help={`Replace KEY with the name of your key for ${shortAddress(me)}.`}
            file={file}
            paste="Paste what your own key's command shows"
            onFile={(next) => {
              setFile(next);
              onBy(fileShape(next) ? { file: next } : undefined);
            }}
          />
        </Stack>
      </Disclosure>
    </Stack>
  );
}
