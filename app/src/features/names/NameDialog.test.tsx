// @vitest-environment jsdom
import { Avatar } from "@gnoworld/ui";
import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import { all, button, click, faceOf, follows, mount, one } from "../../../tests/mount.tsx";
import { NameDialog, type NameDialogProps } from "./NameDialog.tsx";
import { NYM_PREFIX } from "./nym.ts";

// 9f, frames 9 to 15 ("Pick a name and a face"), the person's nebula as the face (ADR-0002 section 1, decision 7 of
// docs/design/coherence.md). The dialog holds no state of the chain: its `phase` is the card's course, and a name shows as
// registered only in the phase `done`.
const ACCOUNT = "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5";
const ONYX = { name: "Onyx", chainId: "onyx-1", real: false };
const MAINNET = { name: "gno.land", chainId: "gnoland-1", real: true };
const FEE = "≈ 0.048 GNOT, an estimate from calls up to block 55,414";

const said = (box: Element) => box.textContent.replaceAll(/\s+/g, " ").trim();
function view(over: Partial<NameDialogProps> = {}) {
  const onRegister = vi.fn();
  const onClose = vi.fn();
  const box = mount(
    <NameDialog
      open
      account={ACCOUNT}
      network={ONYX}
      fee={FEE}
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
    expect(said(dialog)).toContain(NYM_PREFIX);
    expect(said(dialog)).toContain("5 to 13 letters, then 3 digits. Example: nym-alexis042.");
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

  it("says on both universes which chain the name goes to, in the card's words: public and forever, and not checked", () => {
    for (const [network, chain] of [
      [ONYX, "Onyx (onyx-1)"],
      [MAINNET, "gno.land (gnoland-1)"],
    ] as const) {
      const text = said(one(view({ network }).box, "dialog"));
      expect(text).toContain(chain);
      expect(text).toContain("This text goes to gno.land/r/sys/namereg/v0 on gno.land, publicly and forever.");
      expect(text).toContain("gnoworld does not check what this realm does. Read it on gnoweb first.");
    }
  });

  it("sets the realm's path as code, the frames' way", () => {
    expect(one(view().box, "dialog code").textContent).toBe("r/sys/namereg");
  });

  it("asks the name with the frames' placeholder, a name the chain would take", () => {
    expect(one(view().box, "input").getAttribute("placeholder")).toBe("alexis042");
  });

  it("says the fee as the call card's estimate; on gno.land's universe it is real GNOT and the registry's price 0, never free", () => {
    const main = said(one(view({ network: MAINNET }).box, "dialog"));
    expect(main).toContain(`Fee: ${FEE}.`);
    expect(main).toMatch(/paid in real GNOT/);
    expect(main).toMatch(/registry's price is 0 GNOT/);
    expect(main).not.toMatch(/free/i);
    const onyx = said(one(view({ network: ONYX }).box, "dialog"));
    expect(onyx).toContain(`Fee: ${FEE}.`);
    expect(onyx).not.toMatch(/real GNOT/);
    expect(onyx).toContain("test network");
  });

  it("puts Register and Later on one row, Register first, with the fine print under them", () => {
    const { box } = view();
    const row = button(box, "Later")?.parentElement;
    expect(button(box, "Register · 0 GNOT")?.closest("span")?.parentElement).toBe(row);
    expect(row?.firstElementChild?.querySelector("button")).toBe(button(box, "Register · 0 GNOT"));
    const fee = all(box, "p").find((each) => said(each).includes("Fee:"));
    expect(row?.compareDocumentPosition(fee ?? box)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
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

// 9k (answer 9f-1): the design system's five changes, as frames 9 to 15 draw the dialog.
describe("NameDialog: the design system's own parts", () => {
  it("draws the kicker once, above the title through Dialog's kicker slot, not beside the face, and describes the dialog with it", () => {
    const { box } = view();
    const dialog = one(box, "dialog");
    const kickers = all(dialog, "p").filter((each) => said(each) === "YOUR GNO.LAND NAME");
    const [kicker] = kickers;
    const title = one(dialog, "h2");
    expect(kickers).toHaveLength(1);
    expect(kicker?.classList.contains("label")).toBe(true);
    expect(kicker !== undefined && follows(kicker, title)).toBe(true);
    expect(kicker !== undefined && all(box, "svg").every((face) => !face.parentElement?.contains(kicker))).toBe(true);
    expect(dialog.getAttribute("aria-describedby")).toContain(kicker?.id ?? "no id");
  });

  // F5964: frames 9 to 15 put the line naming the registry first, then the face, then the field.
  it("says the line naming r/sys/namereg before the face, and the face before the field", () => {
    const { box } = view();
    const line = one(box, "dialog code").closest("p");
    const face = all(box, "dialog svg")[0];
    expect(line !== null && face !== undefined && follows(line, face)).toBe(true);
    expect(face !== undefined && follows(face, one(box, "dialog input"))).toBe(true);
  });

  it.each<[string, NameDialogProps["phase"]]>([
    ["typing", { kind: "typing" }],
    ["working", { kind: "working", text: "Waiting for Adena" }],
    ["failed, the form stays", { kind: "failed", text: "Refused", again: true }],
    ["failed, no second try", { kind: "failed", text: "Refused", again: false }],
    ["done", { kind: "done", name: "nym-alex042", height: 55414 }],
  ])("draws no Close button while %s: Later or Done is the way out", (_, phase) => {
    const { box } = view({ phase });
    expect(button(box, "Close")).toBeUndefined();
    expect(button(box, phase.kind === "done" ? "Done" : "Later")).toBeDefined();
  });

  it("asks to close on Escape", () => {
    const { box, onClose } = view();
    one(box, "dialog").dispatchEvent(new Event("cancel", { cancelable: true }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("draws nym- inside the field's box, read with the field", () => {
    const { box } = view();
    const input = one(box, "input");
    const inner = input.closest("[data-part='box']");
    expect(inner?.textContent).toContain(NYM_PREFIX);
    expect(input.getAttribute("aria-describedby")).toContain(
      all(box, "span").find((each) => said(each) === NYM_PREFIX)?.id ?? "no id",
    );
  });
});

describe("NameDialog: the name is checked before Adena opens", () => {
  it.each([
    ["alex042", /5 to 13 letters, then 3 digits/],
    ["Alexis042", /5 to 13 letters, then 3 digits/],
    ["gnomes042", /reserved prefix/],
  ])("refuses %s with its problem under the field, Register disabled, and asks for no signature", (typed, problem) => {
    const { box, onRegister } = view();
    const input = type(box, typed);
    click(button(box, "Register · 0 GNOT"));
    expect(button(box, "Register · 0 GNOT")?.hasAttribute("disabled")).toBe(true);
    expect(onRegister).not.toHaveBeenCalled();
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(said(one(box, "dialog"))).toMatch(problem);
  });

  it("draws Register disabled while nothing is typed, as the frames do, and enabled for a name that holds", () => {
    const { box } = view();
    expect(button(box, "Register · 0 GNOT")?.hasAttribute("disabled")).toBe(true);
    type(box, "alexis042");
    expect(button(box, "Register · 0 GNOT")?.hasAttribute("disabled")).toBe(false);
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

  it("says the name registered, with its block, once the chain gave its answer, and the dialog's way out is then Done", () => {
    const { box, onClose } = view({ phase: { kind: "done", name: "nym-alexis042", height: 55414 } });
    expect(button(box, "Later")).toBeUndefined();
    click(button(box, "Done"));
    expect(onClose).toHaveBeenCalledTimes(1);
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

describe("NameDialog: what the form holds and how it is drawn", () => {
  it("starts with an empty field and no complaint about it, and complains once something wrong is typed", () => {
    const { box } = view();
    const input = one(box, "input");
    expect(Reflect.get(input, "value")).toBe("");
    expect(input.getAttribute("aria-invalid")).not.toBe("true");
    type(box, "alex");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    type(box, "");
    expect(input.getAttribute("aria-invalid")).not.toBe("true");
  });

  it("registers nothing when the form is sent with a name that does not hold, and keeps the page where it is when it does", () => {
    const { box, onRegister } = view();
    const form = one(box, "form");
    type(box, "alex");
    act(() => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(onRegister).not.toHaveBeenCalled();
    type(box, "alexis042");
    const sent = new Event("submit", { bubbles: true, cancelable: true });
    act(() => {
      form.dispatchEvent(sent);
    });
    expect(sent.defaultPrevented).toBe(true);
    expect(onRegister).toHaveBeenCalledExactlyOnceWith("alexis042");
  });

  it("names each part by its own class: the status, the notes, the Register button's computer-only span, the phone's line", () => {
    const { box } = view();
    const named = (each: Element, ...parts: string[]) =>
      new RegExp(`^${parts.map((part) => `_${part}_\\w+`).join(" ")}$`).test(each.className);
    expect(named(one(box, "p[role=status]"), "state")).toBe(true);
    expect(all(box, "p").filter((each) => named(each, "note"))).toHaveLength(3);
    expect(named(one(box, "button[type=submit]").closest("span") ?? box, "computer")).toBe(true);
    expect(all(box, "p").filter((each) => named(each, "phone", "note"))).toHaveLength(1);
  });
});
