// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from "vitest";
import { all, button, click, modals, mount, one } from "../tests/mount.tsx";
import { useLeaving } from "./leaving.tsx";

// A page with one link off the site: the address it asks about is the test's own.
function Page({ href }: { href: string }) {
  const { ask, dialog } = useLeaving();
  return (
    <>
      <button
        type="button"
        onClick={() => {
          ask(href);
        }}
      >
        ask
      </button>
      {dialog}
    </>
  );
}

const SHADY = "https://gno.land.evil.example:8443/r/gov/dao?x=1";
const dialogOf = (box: HTMLElement) => all(box, "dialog")[0];

beforeAll(modals);

describe("useLeaving: the warning before a link off the site", () => {
  it("draws no dialog, so no link off the site, until an address was asked", () => {
    const box = mount(<Page href={SHADY} />);
    expect(all(box, "dialog, a")).toEqual([]);
  });

  it("names the host the address really goes to and shows the address whole, before any navigation", () => {
    const box = mount(<Page href={SHADY} />);
    click(button(box, "ask"));
    const host = new URL(SHADY).host;
    expect(dialogOf(box)?.hasAttribute("open")).toBe(true);
    expect(box.textContent).toContain(`This link goes to ${host}`);
    expect(one(box, "code").textContent).toBe(SHADY);
    expect(one(box, "a").getAttribute("href")).toBe(SHADY);
    expect(one(box, "a").textContent).toBe(`Go to ${host}`);
  });

  it("names the whole text of an address that does not parse, never an empty host", () => {
    const box = mount(<Page href="not a url" />);
    click(button(box, "ask"));
    expect(box.textContent).toContain("This link goes to not a url,");
    expect(one(box, "a").textContent).toBe("Go to not a url");
  });

  it("closes on Stay here and keeps the address for the next opening", () => {
    const box = mount(<Page href={SHADY} />);
    click(button(box, "ask"));
    click(button(box, "Stay here"));
    expect(dialogOf(box)?.hasAttribute("open")).toBe(false);
    expect(one(box, "code").textContent).toBe(SHADY);
    click(button(box, "ask"));
    expect(dialogOf(box)?.hasAttribute("open")).toBe(true);
  });
});
