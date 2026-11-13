import { expect } from "vitest";

/** The plate's buttons, once it has come, hold Follow and Share, in words. */
export function expectFollowAndShare(plate: Element | null | undefined): void {
  const buttons = [...(plate?.querySelectorAll("button") ?? [])].map((button) => button.textContent);
  expect(buttons).toContain("Follow");
  expect(buttons).toContain("Share");
}
