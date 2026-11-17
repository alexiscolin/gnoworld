// @vitest-environment jsdom
import { Address } from "@gnoworld/schemas";
import { act } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { button, click, mount, modals, one, settled } from "../../../tests/mount.tsx";
import { StoreProvider } from "../../storeContext.tsx";
import { useApp } from "../../storeContext.tsx";
import { GnokeyLogin, GnokeyLoginDialog } from "./GnokeyLogin.tsx";

// The command line's login (D13880): an address, the server's block to run, the file it printed pasted back, a session.
const ADDRESS = Address.parse("g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5");
const NONCE = "AAAAAAAAAAAAAAAAAAAAAA";
const FILE = '{"msg":[],"fee":{},"signatures":[{"pub_key":{},"signature":"x"}],"memo":""}';
const CODE = {
  nonce: NONCE,
  memo: "Sign in to gnoworld",
  block: "cat > link.json <<'END'",
  expiresAt: "2026-11-17T12:05:00.000Z",
};

beforeAll(modals);
beforeEach(() => {
  vi.stubGlobal("reportError", vi.fn());
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const typeInto = (field: HTMLElement, text: string) => {
  const proto = field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  act(() => {
    Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(field, text);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
};

describe("GnokeyLogin", () => {
  it("asks a code for the address, shows the block, posts the pasted file, and hands back the account logged in", async () => {
    const asked: { url: string; body: unknown }[] = [];
    vi.stubGlobal("fetch", (url: string, init: RequestInit) => {
      asked.push({ url, body: JSON.parse(typeof init.body === "string" ? init.body : "null") });
      return Promise.resolve(Response.json(url.endsWith("/cli/challenge") ? CODE : { address: ADDRESS }));
    });
    const onLoggedIn = vi.fn();
    const box = mount(
      <StoreProvider>
        <GnokeyLogin open onClose={() => undefined} onLoggedIn={onLoggedIn} />
      </StoreProvider>,
    );
    typeInto(one(box, "input"), ADDRESS);
    click(button(box, "Get a code"));
    await settled(() => box.textContent.includes(CODE.block));
    typeInto(one(box, "textarea"), FILE);
    click(button(box, "Log in"));
    await settled(() => onLoggedIn.mock.calls.length > 0);
    expect(onLoggedIn).toHaveBeenCalledWith(ADDRESS);
    expect(asked).toEqual([
      { url: "/api/login/cli/challenge", body: { address: ADDRESS } },
      { url: "/api/login/cli/verify", body: { nonce: NONCE, address: ADDRESS, file: FILE } },
    ]);
  });

  it("gives a new code at once when the server refuses the file, and logs nobody in", async () => {
    let codes = 0;
    vi.stubGlobal("fetch", (url: string) => {
      if (url.endsWith("/cli/challenge")) codes += 1;
      return Promise.resolve(
        url.endsWith("/cli/challenge") ? Response.json(CODE) : Response.json({ error: "refused" }, { status: 400 }),
      );
    });
    const onLoggedIn = vi.fn();
    const box = mount(
      <StoreProvider>
        <GnokeyLogin open onClose={() => undefined} onLoggedIn={onLoggedIn} />
      </StoreProvider>,
    );
    typeInto(one(box, "input"), ADDRESS);
    click(button(box, "Get a code"));
    await settled(() => box.textContent.includes(CODE.block));
    typeInto(one(box, "textarea"), FILE);
    click(button(box, "Log in"));
    await settled(() => codes === 2);
    expect(onLoggedIn).not.toHaveBeenCalled();
    expect(box.textContent).toContain("Here is a new code.");
  });

  it("makes the account the server names the page's session, and closes", async () => {
    vi.stubGlobal("fetch", (url: string) =>
      Promise.resolve(Response.json(url.endsWith("/cli/challenge") ? CODE : { address: ADDRESS })),
    );
    const onClose = vi.fn();
    function Session() {
      const session = useApp((state) => state.login.session);
      return <output>{session.kind === "in" ? session.address : session.kind}</output>;
    }
    const box = mount(
      <StoreProvider>
        <GnokeyLoginDialog open onClose={onClose} />
        <Session />
      </StoreProvider>,
    );
    typeInto(one(box, "input"), ADDRESS);
    click(button(box, "Get a code"));
    await settled(() => box.textContent.includes(CODE.block));
    typeInto(one(box, "textarea"), FILE);
    click(button(box, "Log in"));
    await settled(() => onClose.mock.calls.length > 0);
    expect(one(box, "output").textContent).toBe(ADDRESS);
  });

  it.each([
    [429, "too_many", "Too many tries: wait a minute, then try again."],
    [400, "refused", "The server could not make a code for this address."],
  ])("says why no code came: %i %s", async (status, error, words) => {
    vi.stubGlobal("fetch", () => Promise.resolve(Response.json({ error }, { status })));
    const box = mount(
      <StoreProvider>
        <GnokeyLogin open onClose={() => undefined} onLoggedIn={vi.fn()} />
      </StoreProvider>,
    );
    typeInto(one(box, "input"), ADDRESS);
    click(button(box, "Get a code"));
    await settled(() => box.textContent.includes(words));
    expect(button(box, "Get a code")).toBeDefined();
  });
});
