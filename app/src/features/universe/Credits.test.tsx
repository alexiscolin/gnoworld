// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from "vitest";
import { all, button, click, mount, one, settled } from "../../../tests/mount.tsx";
import { CREDITS } from "../../scene/planet/credits.ts";
import { Credits } from "./Credits.tsx";

const LABEL = "Credits";

// jsdom has no top layer: a dialog it opens is open. The focus, Esc and the scrim are the journeys'.
beforeAll(() => {
  Object.assign(HTMLDialogElement.prototype, {
    showModal(this: HTMLDialogElement) {
      this.open = true;
    },
    close(this: HTMLDialogElement) {
      this.open = false;
      this.dispatchEvent(new Event("close"));
    },
  });
});

// The dialog's code is asked at the first press: the box waits for it, open.
const opened = async () => {
  const box = mount(<Credits />);
  click(button(box, LABEL));
  await settled(() => all(box, "dialog[open]").length === 1);
  return box;
};

describe("the credits", () => {
  it("offer one word, with no dialog till it is pressed", () => {
    const box = mount(<Credits />);
    expect(button(box, LABEL)?.textContent).toBe(LABEL);
    expect(all(box, "dialog")).toHaveLength(0);
  });

  it("open the attributions in full, every row's words", async () => {
    const box = await opened();
    const dialog = one(box, "dialog");
    expect(dialog.hasAttribute("open")).toBe(true);
    for (const credit of CREDITS) expect(dialog.textContent).toContain(credit.line);
  });

  it("link each row to its source and say the day it was read", async () => {
    const box = await opened();
    const links = all(one(box, "dialog"), "a").map((link) => link.getAttribute("href"));
    for (const credit of CREDITS) expect(links).toContain(credit.source);
    for (const credit of CREDITS) expect(links).toContain(credit.licenceUrl);
    expect(links).toHaveLength(CREDITS.length * 2);
    for (const credit of CREDITS) expect(one(box, "dialog").textContent).toContain(credit.read);
  });

  it("send no referrer and no opener with a link out of the site", async () => {
    for (const link of all(one(await opened(), "dialog"), "a")) {
      expect(link.getAttribute("rel")).toContain("noopener");
      expect(link.getAttribute("rel")).toContain("noreferrer");
      expect(link.getAttribute("target")).toBe("_blank");
    }
  });

  it("shut again, by the dialog's own Close", async () => {
    const box = await opened();
    click(button(one(box, "dialog"), "Close"));
    expect(one(box, "dialog").hasAttribute("open")).toBe(false);
  });
});
