// @vitest-environment jsdom
import { Address, shortAddress } from "@gnoworld/schemas";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { button, click, mount, one, settled } from "../../../tests/mount.tsx";
import type { Login, SignResult } from "../../lib/adena/adena.ts";
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
const signed = vi.hoisted(() => {
  const state: { answer: SignResult; asked: Login[]; on: string; wait: Promise<void> } = {
    answer: { ok: false, reason: "failed" },
    asked: [],
    on: "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5",
    wait: Promise.resolve(),
  };
  return state;
});

vi.mock(import("../../lib/adena/adena.ts"), async () => {
  const { Address: Parsed } = await import("@gnoworld/schemas");
  return {
    pageAdena: () => ({}),
    connect: () => Promise.resolve({ ok: true, address: Parsed.parse(signed.on), chainId: "onyx-1" }),
    signLogin: async (_: unknown, login: Login) => {
      signed.asked.push(login);
      await signed.wait;
      return signed.answer;
    },
  };
});

beforeEach(() => {
  vi.stubGlobal("reportError", vi.fn());
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const typeInto = (field: HTMLElement, text: string) => {
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(field, text);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
};

describe("AsMe", () => {
  it("has Adena sign the same text as the logged-in account, on the code's chain, and hands the proof on", async () => {
    signed.answer = { ok: true, proof: PROOF };
    const onBy = vi.fn();
    const box = mount(<AsMe me={ME} code={CODE} signed={false} onBy={onBy} />);
    click(button(box, "Sign in Adena"));
    await settled(() => onBy.mock.calls.length > 0);
    expect(signed.asked.at(-1)).toEqual({ address: ME, chainId: "gnoland-1", text: CODE.text });
    expect(onBy).toHaveBeenLastCalledWith({ proof: PROOF });
  });

  it("says which account Adena is on when it is not the logged-in one, and hands nothing on", async () => {
    signed.answer = { ok: false, reason: "mismatch" };
    const onBy = vi.fn();
    const box = mount(<AsMe me={ME} code={CODE} signed={false} onBy={onBy} />);
    click(button(box, "Sign in Adena"));
    await settled(() => box.textContent.includes("Adena is on"));
    expect(box.textContent).toContain(`Adena is on ${shortAddress(OTHER)}, not ${shortAddress(ME)}.`);
    expect(onBy).not.toHaveBeenCalled();
  });

  it("shows the block for the account's own key, and hands on its file once it has the tool's shape", () => {
    const onBy = vi.fn();
    const box = mount(<AsMe me={ME} code={CODE} signed={false} onBy={onBy} />);
    expect(box.textContent).toContain(CODE.byBlock);
    typeInto(one(box, "textarea"), "not the file");
    expect(onBy).toHaveBeenLastCalledWith(undefined);
    typeInto(one(box, "textarea"), FILE);
    expect(onBy).toHaveBeenLastCalledWith({ file: FILE });
  });

  it("hands nothing on when Adena declines, and asks Adena once while it waits", async () => {
    signed.answer = { ok: false, reason: "declined" };
    let open: () => void = () => undefined;
    signed.wait = new Promise((resolve) => {
      open = resolve;
    });
    signed.asked = [];
    const onBy = vi.fn();
    const box = mount(<AsMe me={ME} code={CODE} signed={false} onBy={onBy} />);
    click(button(box, "Sign in Adena"));
    click(button(box, "Sign in Adena"));
    open();
    await settled(() => box.textContent.includes("You declined in Adena."));
    expect(signed.asked).toHaveLength(1);
    expect(onBy).not.toHaveBeenCalled();
    signed.wait = Promise.resolve();
  });

  it("hands on one proof at a time: Adena's empties the pasted file, a file pasted after replaces Adena's", async () => {
    signed.answer = { ok: true, proof: PROOF };
    const onBy = vi.fn();
    const box = mount(<AsMe me={ME} code={CODE} signed={false} onBy={onBy} />);
    typeInto(one(box, "textarea"), FILE);
    click(button(box, "Sign in Adena"));
    await settled(() => onBy.mock.lastCall?.[0] !== undefined && "proof" in onBy.mock.lastCall[0]);
    expect(one(box, "textarea")).toHaveProperty("value", "");
    typeInto(one(box, "textarea"), FILE);
    expect(onBy).toHaveBeenLastCalledWith({ file: FILE });
  });
});
