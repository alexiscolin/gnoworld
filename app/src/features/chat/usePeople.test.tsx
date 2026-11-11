// @vitest-environment jsdom
import { useRef } from "react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { all, click, mount, settled } from "../../../tests/mount.tsx";
import { usePeople } from "./usePeople.tsx";

function Probe({ drawn }: { drawn: boolean }) {
  const screenRef = useRef<HTMLElement>(null);
  const { ask, panel, dialog } = usePeople({
    screenRef,
    people: <p>the people</p>,
    compact: false,
    present: 2,
    closeThread: undefined,
  });
  return (
    <>
      <button type="button" onClick={ask}>
        ask
      </button>
      {drawn ? <aside ref={panel} tabIndex={-1} /> : null}
      {dialog}
    </>
  );
}

describe("Who's here in a chat that is not compact", () => {
  it("opens the people's dialog when the layout draws no visible info panel, instead of doing nothing", async () => {
    const host = mount(
      <MemoryRouter>
        <Probe drawn={false} />
      </MemoryRouter>,
    );
    click(all(host, "button")[0]);
    await settled(() => document.body.textContent.includes("the people"));
    expect(document.body.textContent).toContain("the people");
  });

  it("focuses the info panel, with no dialog, when the layout draws it (not compact)", async () => {
    // jsdom lays nothing out, so every box has no client rects: the layout's word (compact: false) decides, never a measure at the click.
    const host = mount(
      <MemoryRouter>
        <Probe drawn />
      </MemoryRouter>,
    );
    click(all(host, "button")[0]);
    await settled(() => document.activeElement?.tagName === "ASIDE");
    expect(document.body.textContent).not.toContain("the people");
  });
});
