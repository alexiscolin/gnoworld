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
    <LoginView
      session={{ kind: "out" }}
      step="idle"
      problem={undefined}
      onLogIn={() => undefined}
      onLogOut={() => undefined}
      {...over}
    />,
  );
const buttons = (html: string) => [...html.matchAll(/<button[^>]*>(.*?)<\/button>/g)].map((m) => said(m[1] ?? ""));

describe("LoginView", () => {
  it("offers no login before it knows whether one is open, its status region already there, empty", () => {
    const html = view({ session: { kind: "unknown" } });
    expect(buttons(html)).toEqual([]);
    expect(html.match(/role="status"/g)).toHaveLength(1);
    expect(said(html)).toBe("");
  });

  it("offers a login with Adena to nobody logged in, and tells a phone to log in on a computer, then that it can write from there", () => {
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

  it("shows the account logged in, shortened, and a way out", () => {
    const html = view({ session: { kind: "in", address: ADDRESS } });
    expect(said(html)).toContain("g1jg8m…vsqf5");
    expect(html).toContain(`title="${ADDRESS}"`);
    expect(buttons(html)).toEqual(["Log out"]);
    expect(said(html)).not.toContain("To speak");
  });

  it("says why the last login stopped, in its status region", () => {
    const html = view({ problem: { reason: "address", problem: "checksum" } });
    expect(html).toMatch(/role="status"[^>]*>[^<]*Adena&#x27;s address does not match its checksum/);
  });
});
