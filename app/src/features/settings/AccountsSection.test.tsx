// @vitest-environment jsdom
import { Address } from "@gnoworld/schemas";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { all, button, click, one, settled } from "../../../tests/mount.tsx";
import { mountInStore } from "../../../tests/inStore.tsx";
import { AccountsSection } from "./AccountsSection.tsx";

// Settings, Accounts: "Log out my other sessions" (ADR-0002 §4, a login revocable in the settings): busy while the server is asked, then one
// line saying it is done, or the failure in the words the linked accounts already use.
const ALICE = Address.parse("g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv");
const LABEL = "Log out my other sessions";
const DONE = "Your other sessions are logged out.";

const login = vi.hoisted(() => ({ logoutOthers: vi.fn<() => Promise<unknown>>() }));
vi.mock("../../lib/api/login.ts", () => ({ pageLoginApi: () => login }));
const links = vi.hoisted(() => ({
  list: vi.fn(() => Promise.resolve({ ok: true, value: { members: [], worlds: [], linked: false } })),
}));
vi.mock("../../lib/api/links.ts", () => ({ pageLinksApi: () => links }));

const reported = vi.fn();
beforeEach(() => {
  vi.stubGlobal("reportError", reported);
  login.logoutOthers.mockReset();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const said = (box: HTMLElement) => all(box, "[role='status']").map((each) => each.textContent);
async function mounted() {
  const { box } = await mountInStore(<AccountsSection account={ALICE} />);
  await settled(() => button(box, "Link an account") !== undefined);
  expect(button(box, LABEL), LABEL).toBeDefined();
  return box;
}

describe("Log out my other sessions", () => {
  it("asks the server once on a click, busy until it answers, then says the others are logged out", async () => {
    let answer: (value: unknown) => void = () => undefined;
    login.logoutOthers.mockReturnValue(
      new Promise((resolve) => {
        answer = resolve;
      }),
    );
    const box = await mounted();
    expect(said(box)).not.toContain(DONE);
    click(button(box, LABEL));
    expect(login.logoutOthers).toHaveBeenCalledTimes(1);
    expect(button(box, LABEL)?.hasAttribute("disabled")).toBe(true);
    await act(async () => {
      answer({ ok: true, value: undefined });
      await Promise.resolve();
    });
    expect(button(box, LABEL)?.hasAttribute("disabled")).toBe(false);
    expect(said(box)).toContain(DONE);
    expect(one(box, "#settings-accounts").textContent).not.toContain("could not");
  });

  it("says the failure in the house's words and no done line when the server cannot be reached", async () => {
    login.logoutOthers.mockResolvedValue({ ok: false, reason: "network" });
    const box = await mounted();
    click(button(box, LABEL));
    await settled(() => said(box).includes("The server could not be reached. Try again in a moment."));
    expect(said(box)).not.toContain(DONE);
    expect(reported).not.toHaveBeenCalled();
  });

  it("says a session that ended in the person's own words, not the links' 'too old to change links'", async () => {
    login.logoutOthers.mockResolvedValue({ ok: false, reason: "unauthenticated" });
    const box = await mounted();
    click(button(box, LABEL));
    await settled(() => said(box).includes("Your session has ended. Sign in again to log out your other sessions."));
    expect(one(box, "#settings-accounts").textContent).not.toContain("change links");
    expect(said(box)).not.toContain(DONE);
    expect(button(box, "Sign in again to confirm"), "offers the sign-in").toBeDefined();
  });

  it("takes back an earlier failure's line when the next try goes through", async () => {
    login.logoutOthers.mockResolvedValueOnce({ ok: false, reason: "too_many" });
    login.logoutOthers.mockResolvedValueOnce({ ok: true, value: undefined });
    const box = await mounted();
    click(button(box, LABEL));
    await settled(() => said(box).includes("Too many tries: wait a minute, then try again."));
    click(button(box, LABEL));
    await settled(() => said(box).includes(DONE));
    expect(said(box)).not.toContain("Too many tries: wait a minute, then try again.");
  });
});
