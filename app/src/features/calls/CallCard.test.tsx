// @vitest-environment jsdom
import { realmType } from "@gnoworld/core";
import { Address } from "@gnoworld/schemas";
import fc from "fast-check";
import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import { all, button, click, follows, markup, mount } from "../../../tests/mount.tsx";
import { MEMBERS_ONLY, warnsMembers } from "../../../tests/callFixtures.ts";
import { recordedAdena } from "../../../tests/recordedAdena.ts";
import { callContract } from "../../lib/adena/call.ts";
import type { CallCard as Card } from "../../lib/calls.ts";
import { createAppStore } from "../../store/index.ts";
import { CallCard, type CallCardProps } from "./CallCard.tsx";
import { signCall } from "./signCall.ts";
import { ensureCalls } from "./slice.ts";

// 9d: the card in the thread, never a modal (ADR-0002 section 4, frames 31 to 33 and 108 to 114): the kicker, the title, the
// REALM / FUNCTION / ARGUMENTS / NETWORK / FEE block, the warnings, then "Sign in Adena" and "Cancel" and, once signed, the
// wait and the result. Every state is words, and the result says done only from the chain's answer.
const HASH = "785c189e582beca7c3bccb26afa9ed679bc2a1efc97072dd744d29ce2f83d058";
const REALM = "gno.land/r/demo/profile";
const PARAMS = [
  { Name: "cur", Type: realmType() },
  { Name: "bio", Type: "string" },
  { Name: "times", Type: "int64" },
];
const preview: Card = {
  id: "SetBio",
  chainId: "onyx-1",
  realm: REALM,
  func: "SetBio",
  params: PARAMS,
  texts: ["hello", "3"],
  state: { kind: "preview" },
};
const said = (box: HTMLElement) => box.textContent.replaceAll(/\s+/g, " ").trim();
const view = (over: Partial<CallCardProps> = {}) =>
  markup(
    <CallCard
      card={preview}
      network={{ name: "Onyx", chainId: "onyx-1" }}
      fee="≈ 0.05 GNOT, an estimate"
      onEdit={() => undefined}
      onSign={() => undefined}
      onCancel={() => undefined}
      onRetry={() => undefined}
      {...over}
    />,
  );
const buttons = (box: HTMLElement) => all(box, "button").map((b) => said(b));
// The wait's look: Sign in Adena kept, pressed, with no Cancel, and the ring before the words (F5736, F5737).
function expectWaiting(box: HTMLElement) {
  expect(buttons(box)).toEqual(["Sign in Adena"]);
  expect(all(box, "button")[0]?.getAttribute("aria-busy")).toBe("true");
  expect(all(box, '[role="status"] [data-mark="ring"]')).toHaveLength(1);
}
const withState = (state: Card["state"]) => view({ card: { ...preview, state } });

describe("CallCard, the preview", () => {
  it("is an article in the thread, not a dialog", () => {
    const box = view();
    expect(all(box, "article")).toHaveLength(1);
    expect(all(box, "dialog, [role=dialog], [aria-modal]")).toHaveLength(0);
  });

  it("sets the title large, as the frame's light title (F5730)", () => {
    expect(all(view(), "h2, h3, h4")[0]?.dataset["size"]).toBe("large");
  });

  it("has the kicker and a title naming the function", () => {
    const box = view();
    expect(said(box)).toContain("SIGNATURE REQUEST · ADENA");
    expect(said(all(box, "h2, h3, h4")[0] ?? box)).toContain("SetBio");
  });

  it("names the realm, the function, the arguments, the network and the fee before Adena opens", () => {
    const text = said(view());
    for (const label of ["REALM", "FUNCTION", "ARGUMENTS", "NETWORK", "FEE"]) expect(text).toContain(label);
    expect(text).toContain(REALM);
    expect(text).toContain("Onyx");
    expect(text).toContain("onyx-1");
  });

  it("labels the fee an estimate", () => {
    expect(said(view())).toMatch(/estimate/i);
    expect(said(view({ fee: "Set by Adena when you sign" }))).toContain("Set by Adena when you sign");
  });

  it("warns that gnoworld does not check what the realm does", () => {
    expect(said(view())).toContain("gnoworld does not check what this realm does");
  });

  it("shows every field, named, with its text, editable: one input a field, in the function's order", () => {
    const inputs = all(view(), "input, textarea") as HTMLInputElement[];
    expect(inputs.map((input) => input.value)).toEqual(["hello", "3"]);
    expect(inputs.map((input) => input.labels?.[0]?.textContent)).toEqual(["bio", "times"]);
  });

  it("warns under a text field only, with the realm named: 'This text goes to {realm} on gno.land, publicly and forever'", () => {
    const box = view();
    const warning = `This text goes to ${REALM} on gno.land, publicly and forever`;
    expect(said(box).split(warning)).toHaveLength(2);
    const [bio, times] = all(box, "input, textarea");
    const warned = all(box, "p, small, span, div").filter(
      (e) => e.children.length === 0 && said(e).includes("publicly and forever"),
    );
    expect(warned).toHaveLength(1);
    expect(bio && warned[0] && follows(bio, warned[0])).toBe(true);
    expect(times && warned[0] && follows(warned[0], times)).toBe(true);
  });

  it("warns once per text field: two string fields, two warnings; none for numbers and booleans", () => {
    const two = view({
      card: {
        ...preview,
        params: [PARAMS[0] ?? { Name: "", Type: "" }, { Name: "a", Type: "string" }, { Name: "b", Type: "string" }],
        texts: ["x", "y"],
      },
    });
    expect(said(two).split("publicly and forever")).toHaveLength(3);
    const none = view({
      card: {
        ...preview,
        params: [PARAMS[0] ?? { Name: "", Type: "" }, { Name: "n", Type: "int64" }, { Name: "b", Type: "bool" }],
        texts: ["1", "true"],
      },
    });
    expect(said(none)).not.toContain("publicly and forever");
  });

  it("shows a field's problem under it, the field marked invalid, and does not offer the signature while one stands", () => {
    const box = view({ card: { ...preview, texts: ["hello", "three"] } });
    const [, times] = all(box, "input, textarea");
    expect(times?.getAttribute("aria-invalid")).toBe("true");
    const described =
      times
        ?.getAttribute("aria-describedby")
        ?.split(" ")
        .map((id) => box.querySelector(`[id="${id}"]`)) ?? [];
    expect(described.some((e) => e !== null && said(e as HTMLElement) !== "")).toBe(true);
    expect(
      all(box, "button")
        .find((b) => said(b) === "Sign in Adena")
        ?.hasAttribute("disabled"),
    ).toBe(true);
    expect(all(box, "input")[0]?.getAttribute("aria-invalid")).toBeNull();
  });

  it("offers 'Sign in Adena' and 'Cancel'", () => {
    expect(buttons(view())).toEqual(["Sign in Adena", "Cancel"]);
  });

  it("tells a phone to use a computer to sign (it reads and fills, it signs on a computer)", () => {
    expect(said(view())).toContain("To sign, use a computer");
  });

  it("draws text with markup in it as text: a realm path or a field's text never becomes an element", () => {
    const box = view({ card: { ...preview, texts: ["<img src=x onerror=alert(1)>", "3"] } });
    expect(all(box, "img")).toHaveLength(0);
  });
});

describe("CallCard, the states after the click", () => {
  it("says it waits for the signature in Adena while Adena's popup is open: no Sign and no Cancel, the fields not editable", () => {
    const box = withState({ kind: "signing" });
    expect(said(box)).toContain("Waiting for your signature in Adena…");
    expectWaiting(box);
    expect(all(box, "input, textarea").every((i) => i.hasAttribute("disabled") || i.hasAttribute("readonly"))).toBe(
      true,
    );
  });

  it("says what Adena reported while a call it named a hash for is followed (F5749)", () => {
    const box = withState({ kind: "landing", hash: HASH, adena: "insufficient funds" });
    expect(said(box)).toContain("Adena reported: insufficient funds");
  });

  it("says it is landing in a block, with the hash, once it is sent: nothing yet says done", () => {
    const box = withState({ kind: "landing", hash: HASH });
    expect(said(box)).toMatch(/landing in a block/i);
    expect(said(box)).toContain("tx 785c…d058");
    expect(said(box)).not.toMatch(/signed ·|done/i);
    expectWaiting(box);
    expect(box.querySelector(`[title="${HASH}"]`)).not.toBeNull();
  });

  it("is done, 'Signed · tx …', with the block's height and the returned value, only from the chain's answer", () => {
    const box = withState({ kind: "done", hash: HASH, height: 55414, value: "(42 int)" });
    expect(said(box)).toMatch(/Signed · tx 785c…d058/);
    expect(said(box)).toContain("55,414");
    expect(said(box)).toContain("(42 int)");
    expect(buttons(box)).toEqual(["Close"]);
    expect(box.querySelector(`[title="${HASH}"]`)).not.toBeNull();
  });

  it("is done with no value line for a call that returned nothing", () => {
    const box = withState({ kind: "done", hash: HASH, height: 55414, value: "" });
    expect(said(box)).toContain("Signed · tx");
    expect(said(box)).not.toMatch(/returned/i);
  });

  it("says a failure before the hash in words with its next step, in a status region, with 'Try again' and 'Cancel'", () => {
    const box = withState({ kind: "failed", reason: "locked" });
    expect(all(box, '[role="status"], [role="alert"]').some((e) => /unlock/i.test(said(e)))).toBe(true);
    expect(buttons(box)).toEqual(["Try again", "Cancel"]);
  });

  it("offers only 'Close' after Adena's refusal of a signature it was asked for, and says the call may have gone (F5747)", () => {
    const box = withState({ kind: "failed", reason: "declined-maybe-sent" });
    expect(said(box)).toMatch(/closed Adena's window.*may have been sent.*recent transactions/i);
    expect(buttons(box)).toEqual(["Close"]);
  });

  it("offers only 'Close' after a call that may have been sent, with no hash: never 'Try again' (F5728)", () => {
    const box = withState({ kind: "failed", reason: "maybe-sent" });
    expect(said(box)).toMatch(/recent transactions/i);
    expect(buttons(box)).toEqual(["Close"]);
  });

  it("says a failure after the hash with the hash and the chain's log, and only 'Close'", () => {
    const box = withState({ kind: "failed", reason: "chain", log: "panic: name taken", hash: HASH });
    expect(said(box)).toContain("panic: name taken");
    expect(said(box)).toContain("tx 785c…d058");
    expect(said(box)).not.toMatch(/Signed · tx/);
    expect(buttons(box)).toEqual(["Close"]);
  });

  it("says a call never seen in a block is not known to have failed or succeeded, and keeps its hash to look up", () => {
    const box = withState({ kind: "failed", reason: "unseen", hash: HASH });
    expect(said(box)).toContain(HASH);
    expect(said(box)).not.toMatch(/Signed · tx/);
    expect(buttons(box)).toEqual(["Close"]);
  });

  it("keeps its own status region there from the start, empty in preview: a screen reader announces its change (each field has its own beside it)", () => {
    const own = all(view(), 'p[role="status"]');
    expect(own).toHaveLength(1);
    expect(said(own[0] ?? view())).toBe("");
  });

  it("says a call never seen in a block is not known to have succeeded or failed, naming the wait", () => {
    const box = withState({ kind: "failed", reason: "unseen", hash: HASH });
    expect(said(box)).toMatch(/not known whether it succeeded or failed/i);
    expect(said(box)).toMatch(/about 2 minutes/i);
  });
});

describe("CallCard, a hostile realm's text", () => {
  const hostile = ["<img src=x onerror=alert(1)>", "<script>x</script>"];

  it.each(hostile)(
    "draws the realm's error log and returned value %s as text: no element, the characters as they are",
    (text) => {
      const failed = withState({ kind: "failed", reason: "chain", log: text, hash: HASH });
      const done = withState({ kind: "done", hash: HASH, height: 5, value: text });
      for (const box of [failed, done]) {
        expect(all(box, "img, script")).toHaveLength(0);
        expect(said(box)).toContain(text);
      }
    },
  );

  it("writes a hidden or bidi character of the log and the value out, so no line is drawn unlike what was written", () => {
    const bidi = String.fromCodePoint(0x202e);
    const esc = String.fromCodePoint(0x1b);
    const failed = withState({ kind: "failed", reason: "chain", log: `a${bidi}b${esc}`, hash: HASH });
    const done = withState({ kind: "done", hash: HASH, height: 5, value: `a${bidi}b` });
    expect(failed.textContent).toContain("a<U+202E>b<U+001B>");
    expect(done.textContent).toContain("a<U+202E>b");
    for (const box of [failed, done]) expect(box.textContent).not.toMatch(/(?![\n\t])[\p{Cc}\p{Cf}]/u);
  });
});

describe("CallCard, its buttons and fields call their handlers", () => {
  function handlers() {
    return { onEdit: vi.fn(), onSign: vi.fn(), onCancel: vi.fn(), onRetry: vi.fn() };
  }
  const mounted = (state: Card["state"], on = handlers()) => ({
    box: mount(<CallCard card={{ ...preview, state }} network={{ name: "Onyx", chainId: "onyx-1" }} fee="x" {...on} />),
    on,
  });
  const only = (on: ReturnType<typeof handlers>, name: keyof ReturnType<typeof handlers>) => {
    for (const [each, fn] of Object.entries(on)) expect(fn).toHaveBeenCalledTimes(each === name ? 1 : 0);
  };

  it("signs with its Sign button, and only that", () => {
    const { box, on } = mounted({ kind: "preview" });
    click(button(box, "Sign in Adena"));
    only(on, "onSign");
  });

  it("cancels with its Cancel in preview, on a failure before the hash, and closes with Close once done or failed after a hash", () => {
    for (const state of [
      { kind: "preview" },
      { kind: "failed", reason: "locked" },
      { kind: "done", hash: HASH, height: 5, value: "" },
      { kind: "failed", reason: "chain", hash: HASH },
    ] as const) {
      const { box, on } = mounted(state);
      click(
        button(box, state.kind === "preview" || (state.kind === "failed" && !("hash" in state)) ? "Cancel" : "Close"),
      );
      only(on, "onCancel");
    }
  });

  it("tries again with its Try again, and only that", () => {
    const { box, on } = mounted({ kind: "failed", reason: "declined" });
    click(button(box, "Try again"));
    only(on, "onRetry");
  });

  it("tells its handler which field was typed in and what was typed, by the field's place", () => {
    const { box, on } = mounted({ kind: "preview" });
    const [, times] = all(box, "input") as HTMLInputElement[];
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(times, "42");
      times?.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(on.onEdit).toHaveBeenCalledExactlyOnceWith(1, "42");
    for (const other of [on.onSign, on.onCancel, on.onRetry]) expect(other).not.toHaveBeenCalled();
  });
});

// F5723: what the card draws is what Adena is sent. The card is drawn as the page draws it, from the store's card, and the same
// card is signed through signCall with the recording's stand-in for Adena: the drawn fields and network are compared with
// DoContract's message, not with a helper only a test calls.
const CALLER = Address.parse("g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5");
const ONYX = { chainId: "onyx-1", name: "Onyx", rpc: "https://rpc.onyx.testnets.gno.land:443" };
const LANDED = {
  ok: true as const,
  value: { height: 9, failed: false, data: "", log: "" },
  source: { url: ONYX.rpc, at: "2026-11-05T05:00:00.000Z" },
};
interface Sent {
  messages: { value: Record<string, unknown> }[];
  networkInfo: { chainId: string };
}
const NOTHING = {
  onEdit: () => undefined,
  onSign: () => undefined,
  onCancel: () => undefined,
  onRetry: () => undefined,
};

// What the card drew for these texts, and what DoContract was sent for the same card.
async function drawnAndSent(texts: string[]) {
  const store = ensureCalls(createAppStore());
  store.getState().loginActions.signedIn(CALLER);
  const { open, edit } = store.getState().callsActions;
  open({ id: "a", chainId: ONYX.chainId, realm: REALM, func: "SetBio", params: PARAMS });
  texts.forEach((text, index) => {
    edit("a", index, text);
  });
  const box = mount(<CallCard card={store.getState().calls["a"] ?? preview} network={ONYX} fee="x" {...NOTHING} />);
  const wallet = recordedAdena({ account: CALLER });
  await signCall("a", {
    store,
    adena: wallet.adena,
    universe: ONYX,
    call: callContract,
    read: () => Promise.resolve(LANDED),
    wait: () => Promise.resolve(),
    watch: () => undefined,
  });
  const sent = wallet.asked.find((a) => a.call === "DoContract")?.arg as Sent | undefined;
  return { drawn: all(box, "input").map((input) => (input as HTMLInputElement).value), text: box.textContent, sent };
}

describe("CallCard and the message Adena is sent", () => {
  it("draw the same realm, function, arguments in order and chain, whatever is typed", async () => {
    const run = await fc.check(
      fc.asyncProperty(fc.string({ unit: "grapheme", maxLength: 40 }), fc.integer(), async (bio, times) => {
        const { drawn, text, sent } = await drawnAndSent([bio, String(times)]);
        // A text a CallRequest refuses is no message: the card shows its problem, which other tests read.
        if (sent === undefined) return true;
        const value = sent.messages[0]?.value;
        return (
          JSON.stringify(drawn) === JSON.stringify(value?.["args"]) &&
          [value?.["pkg_path"], value?.["func"], sent.networkInfo.chainId].every((part) => text.includes(String(part)))
        );
      }),
      { numRuns: 25 },
    );
    expect(run.failed).toBe(false);
  });
});

describe("CallCard, the marks of the status line (F5737)", () => {
  it("draws a dot before the words once it is done, and no ring", () => {
    const box = withState({ kind: "done", hash: HASH, height: 9, value: "" });
    expect(all(box, '[role="status"] [data-mark="dot"]')).toHaveLength(1);
    expect(all(box, "[data-mark=ring]")).toHaveLength(0);
  });

  it("draws no mark in the preview or a failure: words with their next step only", () => {
    expect(all(view(), "[data-mark]")).toHaveLength(0);
    expect(all(withState({ kind: "failed", reason: "failed" }), "[data-mark]")).toHaveLength(0);
  });
});

describe("CallCard, the look of the frame (F5731 to F5735)", () => {
  // Vitest reads the card's stylesheet as empty: the rules are the Mac Studio's pictures, the tests read the parts that wear them.
  it("lines the block up as one column: a definition list, each label before its value (F5732)", () => {
    const block = all(view(), "dl")[0] ?? document.body;
    expect(all(block, "dt").map((dt) => dt.textContent)).toEqual(["REALM", "FUNCTION", "ARGUMENTS", "NETWORK", "FEE"]);
    expect(all(block, "dd")).toHaveLength(5);
    expect(block.className).toContain("block");
  });

  it("sets the line under the title in its own class, muted by the stylesheet (F5731)", () => {
    const line = all(view(), "p").find((p) => said(p).startsWith("A call to"));
    expect(line).toBeDefined();
    expect(line?.className).toContain("lede");
  });

  it("wraps its buttons in the tall control of the frame, 44 px (F5735)", () => {
    const footer = all(view(), "footer")[0];
    expect(footer?.parentElement?.className).toContain("tall");
  });
});

// Alexis (D272): a GovDAO vote's card says, before Adena opens, that only the DAO's members can vote, otherwise the chain refuses and
// the fee is lost: one line, in the card every vote opens (the realm view, a pinned action, a page's form). r/gov/dao's votes are
// MustVoteOnProposalSimple and the two of a struct no call carries (read on onyx with gnomcp).
describe("CallCard, a GovDAO vote", () => {
  const vote = (over: Partial<Card> = {}): Card => ({
    ...preview,
    realm: "gno.land/r/gov/dao",
    func: "MustVoteOnProposalSimple",
    ...over,
  });

  it("says before Adena opens that only GovDAO's members can vote, once, before Sign in Adena", () => {
    warnsMembers(view({ card: vote() }));
  });

  it.each([
    ["a call to another realm", { realm: REALM, func: "SetBio" }],
    ["a GovDAO call that is no vote", { func: "ExecuteProposal" }],
    ["a vote of another realm", { realm: "gno.land/r/demo/poll", func: "Vote" }],
    ["a realm whose path only starts as GovDAO's", { realm: "gno.land/r/gov/daox" }],
  ])("says nothing of members on %s", (_name, over) => {
    expect(view({ card: vote(over) }).textContent).not.toContain(MEMBERS_ONLY);
  });

  it("says it no more once the vote is signed: the card then says what the chain did", () => {
    expect(view({ card: vote({ state: { kind: "signing" } }) }).textContent).not.toContain(MEMBERS_ONLY);
  });
});

// The video's card is named after the action ("Boop the pot", f0110), its function in its own row: a pinned action's card is titled
// by its label (design review of 9e-1); a card with no name is titled by its function, as before.
describe("CallCard, its title", () => {
  it("is the name it is given, the function staying in its FUNCTION row", () => {
    const box = view({ title: "Vote" });
    expect(all(box, "h3").map((h) => said(h))).toEqual(["Vote"]);
    expect(said(box)).toMatch(/FUNCTION\s*SetBio/);
  });

  it("is the function when no name is given", () => {
    expect(all(view(), "h3").map((h) => said(h))).toEqual(["SetBio"]);
  });
});
