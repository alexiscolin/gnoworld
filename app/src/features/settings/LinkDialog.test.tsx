// @vitest-environment jsdom
import { Address } from "@gnoworld/schemas";
import { act } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { all, button, click, modals, mount, settled, typeInto } from "../../../tests/mount.tsx";
import { wallet as adena } from "../../../tests/signingAdena.ts";
import { StoreProvider } from "../../storeContext.tsx";
import { LinkDialog } from "./LinkDialog.tsx";

// Both tabs of a link wait for the logged-in account's own proof of the same text (the wallet audit's medium 1), and post it with
// the linked account's: a session alone, relayed by a look-alike site, links nothing.
const ME = Address.parse("g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv");
const B = Address.parse("g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5");
const NONCE = "AAAAAAAAAAAAAAAAAAAAAA";
const EXPIRES = "2026-11-17T12:10:00.000Z";
const FILE = (who: string) => `{"msg":[],"fee":{},"signatures":[{"pub_key":{},"signature":"${who}"}],"memo":""}`;
const proofOf = (address: string) => ({
  signed: {
    chain_id: "onyx-1",
    account_number: "0",
    sequence: "0",
    fee: { amount: [], gas: "0" },
    msgs: [],
    memo: address,
  },
  signature: { pubKey: { typeUrl: "/tm.PubKeySecp256k1", value: "A".repeat(44) }, signature: "A".repeat(88) },
});
vi.mock(import("../../lib/adena/adena.ts"), async () => (await import("../../../tests/signingAdena.ts")).signingAdena);

// The server's /api/links: each code numbered, each verify kept, refused once when told.
function server() {
  const held = { codes: 0, verified: [] as unknown[], refuse: false };
  vi.stubGlobal("fetch", (url: string, init: RequestInit) => {
    const body: unknown = JSON.parse(typeof init.body === "string" ? init.body : "null");
    if (url.endsWith("/challenge")) {
      held.codes += 1;
      const text = `Link B to A, code ${String(held.codes)}`;
      const kind = typeof body === "object" && body !== null && "kind" in body ? body.kind : "";
      return Promise.resolve(
        Response.json(
          kind === "adena"
            ? { nonce: NONCE, text, expiresAt: EXPIRES, chainId: "onyx-1", byBlock: `block of A ${text}` }
            : {
                nonce: NONCE,
                memo: text,
                block: `block of B ${text}`,
                byBlock: `block of A ${text}`,
                expiresAt: EXPIRES,
                chainId: "onyx-1",
              },
        ),
      );
    }
    held.verified.push(body);
    if (held.refuse) {
      held.refuse = false;
      return Promise.resolve(Response.json({ error: "refused" }, { status: 400 }));
    }
    return Promise.resolve(Response.json({ members: [ME, B] }));
  });
  return held;
}

const disabled = (element: HTMLElement | undefined) =>
  element?.getAttribute("aria-disabled") === "true" || (element instanceof HTMLButtonElement && element.disabled);

beforeAll(modals);
beforeEach(() => {
  vi.stubGlobal("reportError", vi.fn());
  adena.asked = [];
  adena.wait = Promise.resolve();
  adena.answer = (login) => ({ ok: true, proof: proofOf(login.address) });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const open = () =>
  mount(
    <StoreProvider>
      <LinkDialog me={ME} onLinked={() => undefined} onClose={() => undefined} />
    </StoreProvider>,
  );

describe("the Adena tab", () => {
  it("keeps B's signature, waits for A's own, then posts both", async () => {
    const held = server();
    const box = open();
    expect(box.textContent).toContain("Switch Adena to the account you want to link, then continue.");
    click(button(box, "Continue"));
    await settled(() => button(box, "Sign in Adena") !== undefined);
    // The opening sentence is done once a code is there: the next step says what to do (the UX pass).
    expect(box.textContent).not.toContain("Switch Adena to the account you want to link, then continue.");
    click(button(box, "Sign in Adena"));
    await settled(() => button(box, "Link") !== undefined);
    expect(disabled(button(box, "Link"))).toBe(true);
    expect(held.verified).toEqual([]);
    click(button(box, "Sign in Adena"));
    await settled(() => !disabled(button(box, "Link")));
    expect(adena.asked.map(({ address }) => address)).toEqual([B, ME]);
    click(button(box, "Link"));
    await settled(() => held.verified.length === 1);
    expect(held.verified[0]).toEqual({ nonce: NONCE, address: B, proof: proofOf(B), by: { proof: proofOf(ME) } });
  });
});

describe("the Command line tab", () => {
  const ready = async () => {
    const held = server();
    const box = open();
    click(all(box, "[role=tab]").find((tab) => tab.textContent === "Command line"));
    typeInto(box.querySelector("input") ?? undefined, B);
    click(button(box, "Get a code"));
    await settled(() => box.textContent.includes("block of A"));
    return { held, box };
  };
  const areas = (box: HTMLElement) => all(box, "textarea");

  it("waits for A's own file as well as B's, then posts both", async () => {
    const { held, box } = await ready();
    // A's own block and paste wait behind "Or sign with gnokey" (the UX pass).
    expect(button(box, "Or sign with gnokey")).toBeDefined();
    const [b, a] = areas(box);
    typeInto(b, FILE("b"));
    expect(disabled(button(box, "Link"))).toBe(true);
    typeInto(a, FILE("a"));
    expect(disabled(button(box, "Link"))).toBe(false);
    click(button(box, "Link"));
    await settled(() => held.verified.length === 1);
    expect(held.verified[0]).toEqual({ nonce: NONCE, address: B, file: FILE("b"), by: { file: FILE("a") } });
  });

  it("drops A's proof with the code a refusal replaces: Link waits for A again", async () => {
    const { held, box } = await ready();
    held.refuse = true;
    typeInto(areas(box)[0], FILE("b"));
    typeInto(areas(box)[1], FILE("a"));
    click(button(box, "Link"));
    await settled(() => held.codes === 2 && box.textContent.includes("code 2"));
    typeInto(areas(box)[0], FILE("b"));
    expect(disabled(button(box, "Link"))).toBe(true);
  });

  it("never counts A's proof of a code a new one replaced while Adena was still open (the review's low 1)", async () => {
    const { box } = await ready();
    let answer: () => void = () => undefined;
    adena.wait = new Promise((resolve) => {
      answer = resolve;
    });
    click(button(box, "Sign in Adena"));
    await settled(() => adena.asked.length === 1);
    // The address edited back to itself: the code goes, Get a code brings a new one.
    typeInto(box.querySelector("input") ?? undefined, "");
    typeInto(box.querySelector("input") ?? undefined, B);
    click(button(box, "Get a code"));
    await settled(() => box.textContent.includes("code 2"));
    act(() => {
      answer();
    });
    await act(async () => {
      await adena.wait;
    });
    typeInto(areas(box)[0], FILE("b"));
    expect(disabled(button(box, "Link"))).toBe(true);
  });
});
