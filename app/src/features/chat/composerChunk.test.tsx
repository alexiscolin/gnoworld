// @vitest-environment jsdom
import { Address } from "@gnoworld/schemas";
import { Component, type ReactNode } from "react";
import { expect, it, vi } from "vitest";
import { mount, settled } from "../../../tests/mount.tsx";
import { MemoryRouter } from "react-router";
import { RoomWriter } from "./Writer.tsx";

// A room's composer that fails as it is drawn (its editor's code, or its chunk) takes the composer's place alone: the page around it,
// the plate and the room's lines, stays.
vi.mock("./Composer.tsx", () => ({
  Composer: () => {
    throw new Error("createEditor: nodes[0] QuoteNode is not a constructor that subclasses LexicalNode");
  },
}));

const ME = Address.parse("g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv");

class Page extends Component<{ children: ReactNode }, { fell: boolean }> {
  override state = { fell: false };
  static getDerivedStateFromError() {
    return { fell: true };
  }
  override render() {
    return this.state.fell ? <p>the page fell</p> : this.props.children;
  }
}

it("keeps the page standing when the room's composer fails as it is drawn, the failure in the composer's place", async () => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  const box = mount(
    <Page>
      <p>the plate</p>
      <MemoryRouter>
        <RoomWriter session={{ kind: "in", address: ME }} room="#bubble" rooms={[]} members={[]} onSay={() => true} />
      </MemoryRouter>
    </Page>,
  );
  await settled(() => box.textContent.includes("Something went wrong."));
  expect(box.textContent).toContain("the plate");
  expect(box.textContent).not.toContain("the page fell");
});

it("hands the composer its key apart, never inside spread props", async () => {
  const said = vi.spyOn(console, "error").mockImplementation(() => undefined);
  const box = mount(
    <MemoryRouter>
      <RoomWriter session={{ kind: "in", address: ME }} room="#bubble" rooms={[]} members={[]} onSay={() => true} />
    </MemoryRouter>,
  );
  await settled(() => box.textContent.includes("Something went wrong."));
  expect(said.mock.calls.flat().join(" ")).not.toMatch(/"key" prop is being spread/);
});
