import { render } from "@testing-library/react";
import { expect, it } from "vitest";

// In this order on purpose: the second test sees what the first drew, unless the setup cleans up.
it("draws a paragraph on the page", () => {
  render(<p>Left behind?</p>);
  expect(document.body.textContent).toContain("Left behind?");
});

it("starts the next test on an empty page", () => {
  expect(document.body.textContent).not.toContain("Left behind?");
});
