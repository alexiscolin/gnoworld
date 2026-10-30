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

    it("draws no caption for another look, whatever a caller passes", () => {
      render(
        <Panel label="Dock" caption="gnoworld · hub atlas">
          x
        </Panel>,
      );
      expect(screen.queryByText("gnoworld · hub atlas")).toBeNull();
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
