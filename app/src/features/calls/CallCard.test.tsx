// @vitest-environment jsdom
import { realmType } from "@gnoworld/core";
import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import { all, button, click, follows, markup, mount } from "../../../tests/mount.tsx";
import type { CallCard as Card } from "../../lib/calls.ts";
import { CallCard, type CallCardProps } from "./CallCard.tsx";

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
const withState = (state: Card["state"]) => view({ card: { ...preview, state } });

describe("CallCard, the preview", () => {
  it("is an article in the thread, not a dialog", () => {
    const box = view();
    expect(all(box, "article")).toHaveLength(1);
    expect(all(box, "dialog, [role=dialog], [aria-modal]")).toHaveLength(0);
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
    expect(buttons(box)).toEqual([]);
    expect(all(box, "input, textarea").every((i) => i.hasAttribute("disabled") || i.hasAttribute("readonly"))).toBe(
      true,
    );
  });

  it("says it is landing in a block, with the hash, once it is sent: nothing yet says done", () => {
    const box = withState({ kind: "landing", hash: HASH });
    expect(said(box)).toMatch(/landing in a block/i);
    expect(said(box)).toContain(HASH.slice(0, 6));
    expect(said(box)).not.toMatch(/signed ·|done/i);
    expect(buttons(box)).toEqual([]);
    expect(box.querySelector(`[title="${HASH}"]`)).not.toBeNull();
  });

  it("is done, 'Signed · tx …', with the block's height and the returned value, only from the chain's answer", () => {
    const box = withState({ kind: "done", hash: HASH, height: 55414, value: "(42 int)" });
    expect(said(box)).toMatch(/Signed · tx 785c18/);
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

  it("says a failure after the hash with the hash and the chain's log, and only 'Close'", () => {
    const box = withState({ kind: "failed", reason: "chain", log: "panic: name taken", hash: HASH });
    expect(said(box)).toContain("panic: name taken");
    expect(said(box)).toContain(HASH.slice(0, 6));
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
