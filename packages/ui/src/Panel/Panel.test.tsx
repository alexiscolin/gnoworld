import { render, screen, within } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Panel } from "./Panel.tsx";

// Slice 5r: the panel of docs/DESIGN-SYSTEM.md's component table (header, body, footer; docked, floating, the plate).
describe("Panel", () => {
  it("is a region named by its label, its header, body and footer in order", () => {
    render(
      <Panel label="Notifications">
        <Panel.Header>
          <h2>Notifications</h2>
        </Panel.Header>
        <Panel.Body>
          <p>Nothing new</p>
        </Panel.Body>
        <Panel.Footer>
          <button type="button">Mark read</button>
        </Panel.Footer>
      </Panel>,
    );
    const panel = screen.getByRole("region", { name: "Notifications" });
    expect(panel.textContent).toBe("NotificationsNothing newMark read");
    expect(within(panel).getByRole("button", { name: "Mark read" })).toBeTruthy();
  });

  it("is docked unless asked, and says its look as an attribute a sheet can read", () => {
    const { rerender } = render(<Panel label="Dock">x</Panel>);
    const panel = () => screen.getByRole("region", { name: "Dock" });
    expect(panel().dataset["look"]).toBe("docked");
    rerender(
      <Panel label="Dock" look="floating">
        x
      </Panel>,
    );
    expect(panel().dataset["look"]).toBe("floating");
  });

  it("draws no box for a part it does not have: a body alone is its one child", () => {
    render(
      <Panel label="Dock">
        <Panel.Body>only</Panel.Body>
      </Panel>,
    );
    const panel = screen.getByRole("region", { name: "Dock" });
    expect(panel.querySelector("header, footer")).toBeNull();
  });

  describe("as the plate", () => {
    it("carries no style attribute: the policy refuses one on a page the build writes (csp.ts), so a colour comes by the sheet", () => {
      const html = renderToStaticMarkup(
        <Panel label="Bubble" look="plate" caption="gnoworld · hub atlas">
          <Panel.Body>x</Panel.Body>
        </Panel>,
      );
      expect(html).not.toMatch(/\sstyle=|--world/);
    });

    it("shows its vertical caption to the eye only: no reader says it, and it is the one label style", () => {
      render(
        <Panel label="Bubble" look="plate" caption="gnoworld · hub atlas">
          <Panel.Body>x</Panel.Body>
        </Panel>,
      );
      const caption = screen.getByText("gnoworld · hub atlas");
      expect(caption.closest("[aria-hidden='true']")).not.toBeNull();
      expect(caption.closest("[data-orientation='vertical']")).not.toBeNull();
      expect(caption.closest("[class*='label']")).not.toBeNull();
    });

    // F3269: the plate's title is fitted to its words as the prototype's fitName does (the column over 0.58 em a letter, from 4
    // letters), in steps a sheet reads: each step holds the longest name its size fits, so no name runs past the text column.
    it.each([
      ["Earth", "6"],
      ["GovDAO", "6"],
      ["BUBBLE", "6"],
      ["Boopers", "8"],
      ["Fresh Mint", "10"],
      ["Art Hall Lagos", "16"],
      ["Kyoto builders of dapps", "more"],
    ])("fits the title of %s to the step %s", (label, fit) => {
      render(
        <Panel label={label} look="plate">
          x
        </Panel>,
      );
      expect(screen.getByRole("region", { name: label }).dataset["fit"]).toBe(fit);
    });

    it("counts a name's letters, not its code units: an emoji is one", () => {
      render(
        <Panel label="🌍🌍🌍🌍🌍🌍" look="plate">
          x
        </Panel>,
      );
      expect(screen.getByRole("region", { name: "🌍🌍🌍🌍🌍🌍" }).dataset["fit"]).toBe("6");
    });

    it("fits no title of a panel that is no plate", () => {
      render(<Panel label="Fresh Mint">x</Panel>);
      expect(screen.getByRole("region", { name: "Fresh Mint" }).dataset["fit"]).toBeUndefined();
    });

    it("draws no caption for another look, whatever a caller passes", () => {
      render(
        <Panel label="Dock" caption="gnoworld · hub atlas">
          x
        </Panel>,
      );
      expect(screen.queryByText("gnoworld · hub atlas")).toBeNull();
    });
  });

  // F3259: the page's layout round a plate: the plate in its place, one outline no reader meets, and what stands beside it.
  describe("Panel.Layout", () => {
    it("holds the plate in its place first, then what stands beside it, after an outline no reader meets", () => {
      const { container } = render(
        <Panel.Layout
          plate={
            <Panel label="Bubble" look="plate">
              x
            </Panel>
          }
        >
          <p>beside</p>
        </Panel.Layout>,
      );
      const layout = container.firstElementChild;
      const parts = [...(layout?.children ?? [])];
      expect(parts).toHaveLength(3);
      expect(parts[0]?.getAttribute("aria-hidden")).toBe("true");
      expect(parts[0]?.childElementCount).toBe(0);
      expect(parts[1]?.querySelector("section")?.getAttribute("aria-label")).toBe("Bubble");
      expect(parts[2]?.textContent).toBe("beside");
    });

    it("is the plate and its outline alone when nothing stands beside it", () => {
      const { container } = render(
        <Panel.Layout
          plate={
            <Panel label="Earth" look="plate">
              x
            </Panel>
          }
        />,
      );
      expect(container.firstElementChild?.children).toHaveLength(2);
    });
  });

  it("keeps a label of markup or of ten thousand letters as text", () => {
    for (const label of ['<img src="x" onerror="alert(1)">', "nym-".padEnd(10_000, "a")]) {
      const { container, unmount } = render(<Panel label={label}>x</Panel>);
      expect(container.querySelector("img")).toBeNull();
      expect(container.querySelector("section")?.getAttribute("aria-label")).toBe(label);
      unmount();
    }
  });
});
