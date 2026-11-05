// What the tests of the 9e call surfaces share (a page's form, a proposed action): the chain they draw on, a vm/qfuncs answer in its
// shape, and how a test waits for a drawing without a sleep. NOT recorded: qfuncs' shape.
import { realmType } from "@gnoworld/core";
import { queryEnvelope } from "@gnoworld/chain/testing/envelopes";
import type { ChainFetch } from "@gnoworld/chain/read";
import { act } from "react";
import { expect, vi } from "vitest";
import { button, click, one } from "./mount.tsx";

export const CHAIN = {
  name: "Onyx",
  chainId: "onyx-1",
  rpc: "https://rpc.onyx.testnets.gno.land:443",
  gnoweb: "https://onyx.testnets.gno.land",
  indexer: "https://indexer.onyx.testnets.gno.land/graphql/query",
};
export const CUR = { Name: "cur", Type: realmType(), Value: "" };
export const field = (Name: string, Type: string) => ({ Name, Type, Value: "" });

/** A vm/qfuncs answer listing `functions`. */
export const listing = (functions: unknown) =>
  Promise.resolve(new Response(JSON.stringify(queryEnvelope({ data: JSON.stringify(functions) }))));

/** The input fields under `box`, as the inputs they are. */
export const inputs = (box: ParentNode): HTMLInputElement[] => [...box.querySelectorAll("input")];

/** The button of `box` named `name`, waited for. */
export const calling = (box: HTMLElement, name: string) =>
  vi.waitFor(() => {
    const found = button(box, name);
    if (found === undefined) throw new Error(`no ${name} yet`);
    return found;
  });

/** The answer of a sibling's read, held back until the read under test has answered and a task has passed: the sibling's Call shows
 * once everything under test has been read and drawn, so a test that expects no Call has waited for the drawing, not guessed at it. */
export async function after(under: ReturnType<typeof vi.fn<ChainFetch>>, answer: () => Promise<Response>) {
  await vi.waitFor(() => {
    expect(under).toHaveBeenCalled();
  });
  await Promise.allSettled(under.mock.results.map((result) => result.value as unknown));
  await new Promise((resolve) => setTimeout(resolve, 0));
  return answer();
}

/** Types `text` into `box` as a person does: the value set, then the input event. */
export function typed(box: HTMLInputElement | undefined, text: string): void {
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(box, text);
    box?.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

/** Clicks `name` under `box` with no wallet asked: the card it opens leaves its Sign in Adena to the person. The card, opened. */
export async function openedUnsigned(box: HTMLElement, name: string): Promise<HTMLElement> {
  const touched = vi.fn(() => undefined);
  Object.defineProperty(globalThis, "adena", { get: touched, configurable: true });
  try {
    click(await calling(box, name));
    expect(touched).not.toHaveBeenCalled();
    const card = one(box, "article");
    expect(card.textContent).toContain("Sign in Adena");
    return card;
  } finally {
    Reflect.deleteProperty(globalThis, "adena");
  }
}

/** That a card was read from gno.land's own chain, never onyx's, and names gnoland-1: `urls` are the reads made. */
export function onGnoland(urls: readonly string[], card: HTMLElement): void {
  const hosts = urls.map((url) => new URL(url).host);
  expect(hosts).toContain("rpc.gno.land");
  expect(hosts).not.toContain("rpc.onyx.testnets.gno.land");
  expect(card.textContent).toContain("(gnoland-1)");
}

/** That `card` is prefilled with `values` and names the realm and the function it calls (`call`). */
export function prefilled(card: HTMLElement, values: readonly string[], call: { realm: string; func: string }): void {
  expect(inputs(card).map((input) => input.value)).toEqual(values);
  expect(card.textContent).toContain(call.realm);
  expect(card.textContent).toContain(call.func);
}
