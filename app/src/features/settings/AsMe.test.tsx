// @vitest-environment jsdom
import { Address, shortAddress } from "@gnoworld/schemas";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { button, click, follows, mount, one, settled, typeInto } from "../../../tests/mount.tsx";
import { wallet as signed } from "../../../tests/signingAdena.ts";
import { AsMe } from "./AsMe.tsx";

// The account that asks a link signs its text too (the wallet audit's medium 1): Adena as that account, or its key's file.
const ME = Address.parse("g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv");
const OTHER = Address.parse("g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5");
const CODE = { text: "Link B to A", byBlock: "cat > link.json <<'END' # for A", chainId: "gnoland-1" };
const FILE = '{"msg":[],"fee":{},"signatures":[{"pub_key":{},"signature":"x"}],"memo":""}';
const PROOF = {
  signed: { chain_id: "onyx-1", account_number: "0", sequence: "0", fee: { amount: [], gas: "0" }, msgs: [], memo: "" },
  signature: { pubKey: { typeUrl: "/tm.PubKeySecp256k1", value: "A".repeat(44) }, signature: "A".repeat(88) },
};
vi.mock(import("../../lib/adena/adena.ts"), async () => (await import("../../../tests/signingAdena.ts")).signingAdena);

beforeEach(() => {
  vi.stubGlobal("reportError", vi.fn());
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AsMe", () => {
  // PR #41's UX review: one label naming the account, at most one line under it, and the way of the tab it is in first.
  it("names the account in its label, and gives its own key's block first where the tab is the command line's", () => {
    const box = mount(<AsMe me={ME} code={CODE} first="file" step={4} next onBy={vi.fn()} />);
    expect(box.textContent).toContain(`4 · Sign as yourself · ${shortAddress(ME)}`);
    const fold = button(box, "Or sign in Adena");
    const area = box.querySelector("textarea");
    if (fold === undefined || area === null) throw new Error("no fold or no paste box");
    expect(follows(area, fold)).toBe(true);
    expect(fold.getAttribute("aria-expanded")).toBe("false");
  });

  it("gives Adena first where the tab is Adena's, its own key's way folded and a computer's alone", () => {
    const box = mount(<AsMe me={ME} code={CODE} first="adena" next onBy={vi.fn()} />);
    expect(box.textContent).toContain(`Sign as yourself · ${shortAddress(ME)}`);
    expect(box.textContent).not.toContain("the account you are logged in as");
    expect(button(box, "Or sign with gnokey")?.closest(".fine-only")).not.toBeNull();
  });

  it("has Adena sign the same text as the logged-in account, on the code's chain, and hands the proof on", async () => {
    signed.answer = () => ({ ok: true, proof: PROOF });
    const onBy = vi.fn();
    const box = mount(<AsMe me={ME} code={CODE} first="adena" next onBy={onBy} />);
    click(button(box, "Sign in Adena"));
    await settled(() => onBy.mock.calls.length > 0);
    expect(signed.asked.at(-1)).toEqual({ address: ME, chainId: "gnoland-1", text: CODE.text });
    expect(onBy).toHaveBeenLastCalledWith({ proof: PROOF });
  });

  it("says which account Adena is on when it is not the logged-in one, and hands nothing on", async () => {
    signed.answer = () => ({ ok: false, reason: "mismatch" });
    const onBy = vi.fn();
    const box = mount(<AsMe me={ME} code={CODE} first="adena" next onBy={onBy} />);
    click(button(box, "Sign in Adena"));
    await settled(() => box.textContent.includes("Adena is on"));
    expect(box.textContent).toContain(`Adena is on ${shortAddress(OTHER)}, not ${shortAddress(ME)}.`);
    expect(onBy).not.toHaveBeenCalled();
  });

  it("shows the block for the account's own key, and hands on its file once it has the tool's shape", () => {
    const onBy = vi.fn();
    const box = mount(<AsMe me={ME} code={CODE} first="adena" next onBy={onBy} />);
    expect(box.textContent).toContain(CODE.byBlock);
    typeInto(one(box, "textarea"), "not the file");
    expect(onBy).toHaveBeenLastCalledWith(undefined);
    typeInto(one(box, "textarea"), FILE);
    expect(onBy).toHaveBeenLastCalledWith({ file: FILE });
  });

  it("hands nothing on when Adena declines, and asks Adena once while it waits", async () => {
    signed.answer = () => ({ ok: false, reason: "declined" });
    let open: () => void = () => undefined;
    signed.wait = new Promise((resolve) => {
      open = resolve;
    });
    signed.asked = [];
    const onBy = vi.fn();
    const box = mount(<AsMe me={ME} code={CODE} first="adena" next onBy={onBy} />);
    click(button(box, "Sign in Adena"));
    click(button(box, "Sign in Adena"));
    open();
    await settled(() => box.textContent.includes("You declined in Adena."));
    expect(signed.asked).toHaveLength(1);
    expect(onBy).not.toHaveBeenCalled();
    signed.wait = Promise.resolve();
  });

  it("hands on one proof at a time: Adena's empties the pasted file, a file pasted after replaces Adena's", async () => {
    signed.answer = () => ({ ok: true, proof: PROOF });
    const onBy = vi.fn();
    const box = mount(<AsMe me={ME} code={CODE} first="adena" next onBy={onBy} />);
    typeInto(one(box, "textarea"), FILE);
    click(button(box, "Sign in Adena"));
    await settled(() => onBy.mock.lastCall?.[0] !== undefined && "proof" in onBy.mock.lastCall[0]);
    expect(one(box, "textarea")).toHaveProperty("value", "");
    typeInto(one(box, "textarea"), FILE);
    expect(onBy).toHaveBeenLastCalledWith({ file: FILE });
  });
});
