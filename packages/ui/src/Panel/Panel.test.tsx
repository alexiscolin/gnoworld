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
    it("carries the world's own colour as --world, and no colour when it has none", () => {
      const { rerender } = render(
        <Panel label="Bubble" look="plate" tint="#ff9c4a">
          x
        </Panel>,
      );
      const plate = () => screen.getByRole("region", { name: "Bubble" });
      expect(plate().dataset["look"]).toBe("plate");
      expect(plate().style.getPropertyValue("--world")).toBe("#ff9c4a");
      rerender(
        <Panel label="Bubble" look="plate">
          x
        </Panel>,
      );
      expect(plate().style.getPropertyValue("--world")).toBe("");
    });

    it("takes no declaration from a colour that is none: a tint with a semicolon or a url( is refused, whole", () => {
      for (const tint of [
        "red;background:url(//evil.example/x)",
        "url(//evil.example/x)",
        "#fff;x:y",
        "var(--a)",
        "",
      ]) {
        const html = renderToStaticMarkup(
          <Panel label="Bubble" look="plate" tint={tint}>
            x
          </Panel>,
        );
        expect(html, tint).not.toMatch(/evil|url\(|background|--world/);
      }
    });

    it("keeps the colours a world's data may hold: a hex colour of 3, 6 or 8 digits", () => {
      for (const tint of ["#fa4", "#ff9c4a", "#ff9c4acc"]) {
        expect(
          renderToStaticMarkup(
            <Panel label="Bubble" look="plate" tint={tint}>
              x
            </Panel>,
          ),
        ).toContain(`--world:${tint}`);
      }
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
