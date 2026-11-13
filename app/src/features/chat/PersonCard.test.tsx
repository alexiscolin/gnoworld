// @vitest-environment jsdom
import { act } from "react";
import { useLocation } from "react-router";
import { beforeEach, describe, expect, it } from "vitest";
import { mountInStore } from "../../../tests/inStore.tsx";
import { all, button, click, settled } from "../../../tests/mount.tsx";
import { shortAddress } from "./names.ts";
import { PersonCard, type PersonCardProps } from "./PersonCard.tsx";

// A person's card (8d): Message and Follow only for an account the reader can name, never for a guest, oneself or a nick; Message goes to
// the account's address and Follow keeps that address.
const ALICE = "g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv";
const BOB = "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5";

function Where() {
  return <output data-search>{useLocation().search}</output>;
}

async function opened(over: Partial<PersonCardProps>) {
  const { box } = await mountInStore(
    <>
      <PersonCard name={ALICE} guest={false} country={undefined} me={BOB} {...over}>
        name
      </PersonCard>
      <Where />
    </>,
  );
  act(() => {
    all(box, "button")[0]?.click();
  });
  return box;
}
const actions = (box: HTMLElement) =>
  all(box, "dialog button:not([role='tab'])")
    .map((each) => each.textContent)
    .filter(Boolean);
const follows = (): unknown => JSON.parse(localStorage.getItem("gnoworld:device:follows") ?? "null");

beforeEach(() => {
  localStorage.clear();
});

describe("a person's card", () => {
  it.each([
    ["a guest reading it", { me: undefined }],
    ["a guest it shows", { name: "guest-ab12cd", guest: true }],
    ["a nick that is no account, though not marked a guest", { name: "noor" }],
    ["an account marked a guest", { guest: true }],
    ["the reader's own", { name: BOB }],
  ])("has no Message and no Follow for %s", async (_who, over) => {
    const box = await opened(over);
    expect(actions(box)).toEqual([]);
  });

  it("names an account with no registered name by its short address once, never twice", async () => {
    const box = await opened({});
    await settled(() => actions(box).includes("Follow"));
    const text = all(box, "dialog")[0]?.textContent ?? "";
    expect(text.split(shortAddress(ALICE)).length - 1).toBe(1);
  });

  it("offers Message and Follow for another account", async () => {
    const box = await opened({});
    await settled(() => actions(box).includes("Follow"));
    expect(actions(box).sort()).toEqual(["Follow", "Message"]);
  });

  it("sends Message to the account's address", async () => {
    const box = await opened({});
    click(button(box, "Message"));
    expect(new URLSearchParams(all(box, "[data-search]")[0]?.textContent).get("dm")).toBe(ALICE);
  });

  it("follows the account by its address, never its shown name", async () => {
    const box = await opened({});
    await settled(() => actions(box).includes("Follow"));
    click(button(box, "Follow"));
    expect(follows()).toEqual({ worlds: [], people: [ALICE] });
  });
});
