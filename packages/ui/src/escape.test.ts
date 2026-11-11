import { afterEach, describe, expect, it } from "vitest";
import { holdsEscape } from "./escape.ts";

const press = (target: Element, init: KeyboardEventInit = {}) => {
  let seen = false;
  target.addEventListener("keydown", (event) => {
    if (event instanceof KeyboardEvent) seen = holdsEscape(event);
  });
  target.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, ...init }));
  return seen;
};
const add = <T extends HTMLElement>(node: T) => {
  document.body.append(node);
  return node;
};

afterEach(() => {
  document.body.replaceChildren();
});

describe("who holds an Escape", () => {
  it("nobody holds it on a plain page", () => {
    expect(press(add(document.createElement("div")))).toBe(false);
  });

  it.each(["input", "textarea", "select"])("a %s holds it: Escape is theirs", (tag) => {
    expect(press(add(document.createElement(tag)))).toBe(true);
  });

  it("a field that is edited by its attribute holds it", () => {
    const editor = add(document.createElement("div"));
    editor.setAttribute("contenteditable", "true");
    expect(press(editor)).toBe(true);
  });

  it.each(["", "plaintext-only"])(
    "a field edited by contenteditable=%j holds it, as space's and the dialog's fields do",
    (value) => {
      const editor = add(document.createElement("div"));
      editor.setAttribute("contenteditable", value);
      expect(press(editor)).toBe(true);
    },
  );

  it("an input method's composition holds it", () => {
    expect(press(add(document.createElement("div")), { isComposing: true })).toBe(true);
  });

  it("Safari's composition, isComposing false with keyCode 229, holds it", () => {
    expect(press(add(document.createElement("div")), { keyCode: 229 })).toBe(true);
  });

  it("an Escape a tooltip or a chart's reading already took (its default prevented) is held", () => {
    const node = add(document.createElement("div"));
    node.addEventListener("keydown", (event) => {
      event.preventDefault();
    });
    expect(press(node, { cancelable: true })).toBe(true);
  });

  it("an open dialog holds it, wherever the key was pressed", () => {
    const dialog = add(document.createElement("dialog"));
    dialog.setAttribute("open", "");
    expect(press(add(document.createElement("div")))).toBe(true);
  });

  const layer = (popover: string, extra?: string) => {
    const node = add(document.createElement("div"));
    node.setAttribute("popover", popover);
    if (extra !== undefined) node.setAttribute(extra, "");
    node.showPopover();
    return node;
  };

  it("a menu, a popover that closes on Escape of its own, holds it only while it is open", () => {
    const menu = layer("auto");
    expect(press(add(document.createElement("div")))).toBe(true);
    menu.hidePopover();
    expect(press(add(document.createElement("div")))).toBe(false);
  });

  it("a shown flash or tooltip (a manual popover) does not hold it", () => {
    layer("manual");
    expect(press(add(document.createElement("div")))).toBe(false);
  });

  it("a manual popover that says it takes Escape holds it", () => {
    layer("manual", "data-takes-escape");
    expect(press(add(document.createElement("div")))).toBe(true);
  });
});
