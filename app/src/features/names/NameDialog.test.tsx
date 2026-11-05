// @vitest-environment jsdom
import { Avatar } from "@gnoworld/ui";
import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import { all, button, click, faceOf, mount, one } from "../../../tests/mount.tsx";
import { NameDialog, type NameDialogProps } from "./NameDialog.tsx";

// 9f, frames 9 to 15 ("Pick a name and a face"), the person's nebula as the face (ADR-0002 section 1, decision 7 of
// docs/design/coherence.md). The dialog holds no state of the chain: its `phase` is the card's course, and a name shows as
// registered only in the phase `done`.
const ACCOUNT = "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5";
const ONYX = { name: "Onyx", chainId: "onyx-1", real: false };
const MAINNET = { name: "gno.land", chainId: "gnoland-1", real: true };

const said = (box: Element) => box.textContent.replaceAll(/\s+/g, " ").trim();
function view(over: Partial<NameDialogProps> = {}) {
  const onRegister = vi.fn();
  const onClose = vi.fn();
  const box = mount(
    <NameDialog
      open
      account={ACCOUNT}
      network={ONYX}
      phase={{ kind: "typing" }}
      onRegister={onRegister}
      onClose={onClose}
      {...over}
    />,
  );
  return { box, onRegister, onClose };
}
// A person typing: React reads the value through the native setter and an input event.
function type(box: HTMLElement, text: string) {
  const input = one(box, "input");
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, text);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  return input;
}

describe("NameDialog: the frames' parts", () => {
  it("is a dialog named 'Pick a name and a face', with the kicker, the line naming r/sys/namereg and the field's prefix and rule", () => {
    const { box } = view();
    const dialog = one(box, "dialog");
    expect(dialog.getAttribute("aria-labelledby")).toBeTruthy();
    expect(said(dialog)).toMatch(/Pick a name and a face/);
    expect(said(dialog)).toMatch(/your gno\.land name/i);
    expect(said(dialog)).toContain("r/sys/namereg");
    expect(said(dialog)).toContain("nym-");
    expect(said(dialog)).toContain("5 to 13 letters, then 3 digits");
    expect(all(box, "button").map(said)).toEqual(expect.arrayContaining(["Register · 0 GNOT", "Later"]));
  });

  it("shows the person's nebula from their address as the face, and offers no planet, no picture to upload, no choice of face", () => {
    const { box } = view();
    const drawn = mount(<Avatar address={ACCOUNT} name="you" />);
    expect(faceOf(one(box, "dialog"))).toContain(faceOf(drawn));
    expect(faceOf(drawn)).not.toBe("");
    expect(all(box, "input[type=file]")).toHaveLength(0);
    expect(all(box, "button").map(said).join(" ")).not.toMatch(/upload|planet|choose|face/i);
  });

  it("says on gno.land's universe that the registry's price is 0 and the network fee is real GNOT, and on Onyx that it is a test network's", () => {
    const main = said(one(view({ network: MAINNET }).box, "dialog"));
    expect(main).toMatch(/real GNOT/);
    expect(main).toMatch(/registry's price is 0 GNOT/);
    expect(main).not.toMatch(/free/i);
    const onyx = said(one(view({ network: ONYX }).box, "dialog"));
    expect(onyx).not.toMatch(/real GNOT/);
    expect(onyx).toContain("Onyx");
  });

  it("tells a phone it reads only: to sign, use a computer", () => {
    expect(said(one(view().box, "dialog"))).toContain("To sign, use a computer");
  });

  it("asks to close, never registers, on Later", () => {
    const { box, onClose, onRegister } = view();
    click(button(box, "Later"));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onRegister).not.toHaveBeenCalled();
  });
});

describe("NameDialog: the name is checked before Adena opens", () => {
  it.each([
    ["alex042", /5 to 13 letters, then 3 digits/],
    ["Alexis042", /5 to 13 letters, then 3 digits/],
    ["gnomes042", /reserved prefix/],
  ])("refuses %s with its problem under the field, and asks for no signature", (typed, problem) => {
    const { box, onRegister } = view();
    const input = type(box, typed);
    click(button(box, "Register · 0 GNOT"));
    expect(onRegister).not.toHaveBeenCalled();
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(said(one(box, "dialog"))).toMatch(problem);
  });

  it("asks to register the typed name, and only it, when it is valid", () => {
    const { box, onRegister } = view();
    type(box, "alexis042");
    click(button(box, "Register · 0 GNOT"));
    expect(onRegister).toHaveBeenCalledExactlyOnceWith("alexis042");
  });
});

describe("NameDialog: nothing is registered until the chain says so", () => {
  const working = { kind: "working", text: "Waiting for your signature in Adena…" } as const;

  it("says the wait, not a name, while Adena signs or the hash lands, and offers no Register to press", () => {
    const { box } = view({ phase: working });
    expect(said(one(box, "dialog"))).toContain("Waiting for your signature in Adena…");
    expect(said(one(box, "dialog"))).not.toMatch(/registered/i);
    expect(button(box, "Register · 0 GNOT")?.hasAttribute("disabled") ?? true).toBe(true);
  });

  it("says the name registered, with its block, once the chain gave its answer", () => {
    const { box } = view({ phase: { kind: "done", name: "nym-alexis042", height: 55414 } });
    expect(said(one(box, "dialog"))).toContain("nym-alexis042");
    expect(said(one(box, "dialog"))).toMatch(/registered/i);
    expect(said(one(box, "dialog"))).toContain("55,414");
  });

  it("says why it failed and offers Register again when nothing was sent", () => {
    const { box, onRegister } = view({ phase: { kind: "failed", text: "You declined in Adena.", again: true } });
    expect(said(one(box, "dialog"))).toContain("You declined in Adena.");
    type(box, "alexis042");
    click(button(box, "Register · 0 GNOT"));
    expect(onRegister).toHaveBeenCalledWith("alexis042");
  });

  it("offers no second Register when the first may have been sent (maybe-sent with no hash): the person checks first", () => {
    const { box } = view({ phase: { kind: "failed", text: "It may have been sent.", again: false } });
    expect(said(one(box, "dialog"))).toContain("It may have been sent.");
    expect(button(box, "Register · 0 GNOT")).toBeUndefined();
    expect(all(box, "input")).toHaveLength(0);
    expect(button(box, "Later")).toBeDefined();
  });
});
