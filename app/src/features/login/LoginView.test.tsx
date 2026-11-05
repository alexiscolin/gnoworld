import { Address } from "@gnoworld/schemas";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LoginView, type LoginViewProps } from "./LoginView.tsx";

const ADDRESS = Address.parse("g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5");
// The words a page says, its markup taken off.
const said = (html: string) =>
  html
    .replaceAll(/<[^>]+>/g, " ")
    .replaceAll(/\s+/g, " ")
    .trim();
const view = (over: Partial<LoginViewProps> = {}) =>
  renderToStaticMarkup(
    <LoginView session={{ kind: "out" }} step="idle" problem={undefined} onLogIn={() => undefined} {...over} />,
  );
const buttons = (html: string) => [...html.matchAll(/<button[^>]*>(.*?)<\/button>/g)].map((m) => said(m[1] ?? ""));

describe("LoginView", () => {
  it("offers no login before it knows whether one is open, its status region already there, empty", () => {
    const html = view({ session: { kind: "unknown" } });
    expect(buttons(html)).toEqual([]);
    expect(html.match(/role="status"/g)).toHaveLength(1);
    expect(said(html)).toBe("");
  });

  it("offers one pill, Connect Adena, to nobody logged in, and tells a phone to log in on a computer, then that it can write from there", () => {
    const html = view();
    expect(buttons(html)).toEqual(["Connect Adena"]);
    expect(said(html)).toContain("To log in, use a computer; once logged in you can write from here.");
    expect(said(html)).not.toContain("To speak");
  });

  it.each([
    ["wallet", "Opening Adena…"],
    ["signing", "Sign the text in Adena…"],
    ["verifying", "Checking your signature…"],
  ] as const)("says the step a login is at (%s), its button busy, so it starts once", (step, words) => {
    const html = view({ step });
    expect(buttons(html)).toEqual([words]);
    expect(html).toMatch(/<button[^>]*aria-busy="true"/);
  });

  it.each(["in", "unknown"] as const)(
    "is its status region alone, no box round it, while the session is %s: an empty box would hold a gap in the header's row (8p's review)",
    (kind) => {
      const html = view({ session: kind === "in" ? { kind, address: ADDRESS } : { kind } });
      expect(html).toMatch(/^<p role="status"[^>]*><\/p>$/);
    },
  );

  it("draws nothing but its status region once logged in: the account's pill and its menu hold the address and the way out (frame 17)", () => {
    const html = view({ session: { kind: "in", address: ADDRESS } });
    expect(buttons(html)).toEqual([]);
    expect(said(html)).toBe("");
    expect(html.match(/role="status"/g)).toHaveLength(1);
  });

  it("says why a logout failed while the account is still in, in its status region (the red pass's medium)", () => {
    const html = view({ session: { kind: "in", address: ADDRESS }, problem: { reason: "network" } });
    expect(html).toMatch(
      /role="status"[^>]*>The server could not be reached\. Check your connection, then try again\.</,
    );
  });

  it("says why the last login stopped, in its status region", () => {
    const html = view({ problem: { reason: "address", problem: "checksum" } });
    expect(html).toMatch(/role="status"[^>]*>[^<]*Adena&#x27;s address does not match its checksum/);
  });
});
