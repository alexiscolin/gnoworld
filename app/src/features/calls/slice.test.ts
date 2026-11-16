import { Address } from "@gnoworld/schemas";
import { describe, expect, it } from "vitest";
import { createAppStore } from "../../store/index.ts";
import { callsIn, ensureCalls, type CallsStore } from "./slice.ts";

// The call cards' slice. A card is one call being prepared, signed and followed to its block; its state moves
// only along the course, so nothing shows as done before the chain's answer (ADR-0002 section 4).
const HASH = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const PARAMS = [
  { Name: "cur", Type: "gno.land/p/nt/ufmt/v0.realm" },
  { Name: "bio", Type: "string" },
];
const made = () => ensureCalls(createAppStore());
const NEW = { id: "SetBio", chainId: "onyx-1", realm: "gno.land/r/demo/profile", func: "SetBio", params: PARAMS };

function opened() {
  const store = made();
  store.getState().callsActions.open(NEW);
  return store;
}
const card = (store: CallsStore, id = "SetBio") => store.getState().calls[id];
const state = (store: CallsStore, id = "SetBio") => card(store, id)?.state.kind;

describe("ensureCalls: the slice joins the page's store when a card is first drawn", () => {
  it("is not in the store before: the first screen's store carries no card", () => {
    const state = createAppStore().getState();
    expect(Object.hasOwn(state, "calls")).toBe(false);
    expect(Object.hasOwn(state, "callsActions")).toBe(false);
  });

  it("is added once: asking again changes nothing, the cards kept", () => {
    const store = opened();
    ensureCalls(store);
    expect(store.getState().calls["SetBio"]?.state.kind).toBe("preview");
  });
});

describe("callsIn: the one way to read the slice, which is absent until a card is drawn (F5726)", () => {
  it("gives nothing for a store that has not got the slice, and the slice once it has", () => {
    const store = createAppStore();
    expect(callsIn(store.getState())).toBeUndefined();
    ensureCalls(store);
    expect(callsIn(store.getState())?.calls).toEqual({});
  });
});

describe("the store's calls slice", () => {
  it("starts with no card", () => {
    expect(made().getState().calls).toEqual({});
  });

  it("opens a card in preview with one empty text per field, and keeps one card a row: opening it again changes nothing", () => {
    const store = opened();
    expect(card(store)).toMatchObject({ realm: NEW.realm, func: "SetBio", texts: [""], state: { kind: "preview" } });
    store.getState().callsActions.edit("SetBio", 0, "hello");
    store.getState().callsActions.open(NEW);
    expect(card(store)?.texts).toEqual(["hello"]);
  });

  it("edits one text, only in preview: a card that is being signed keeps the texts it was signed with", () => {
    const store = opened();
    const { edit, signing } = store.getState().callsActions;
    edit("SetBio", 0, "hello");
    expect(card(store)?.texts).toEqual(["hello"]);
    signing("SetBio");
    edit("SetBio", 0, "changed");
    expect(card(store)?.texts).toEqual(["hello"]);
  });

  it("ignores an edit of a field the card has not, and of a card that does not exist", () => {
    const store = opened();
    const { edit } = store.getState().callsActions;
    edit("SetBio", 3, "x");
    edit("SetBio", -1, "x");
    edit("Nothing", 0, "x");
    expect(card(store)?.texts).toEqual([""]);
    expect(store.getState().calls["Nothing"]).toBeUndefined();
  });

  it("goes preview, signing, landing, done, and holds the block's height and the returned value only then", () => {
    const store = opened();
    const { signing, landing, done } = store.getState().callsActions;
    signing("SetBio");
    expect(state(store)).toBe("signing");
    landing("SetBio", HASH);
    expect(card(store)?.state).toEqual({ kind: "landing", hash: HASH });
    done("SetBio", { height: 4242, value: "(42 int)" });
    expect(card(store)?.state).toEqual({ kind: "done", hash: HASH, height: 4242, value: "(42 int)" });
  });

  it("keeps Adena's log from landing to a failure, for the card to say (F5749)", () => {
    const store = opened();
    const { signing, landing, failed } = store.getState().callsActions;
    signing("SetBio");
    landing("SetBio", HASH, "insufficient funds");
    expect(card(store)?.state).toEqual({ kind: "landing", hash: HASH, adena: "insufficient funds" });
    failed("SetBio", { reason: "unseen", hash: HASH, adena: "insufficient funds" });
    expect(card(store)?.state).toEqual({ kind: "failed", reason: "unseen", hash: HASH, adena: "insufficient funds" });
  });

  it("is never done before the chain's answer: done from preview or signing is ignored, and so is landing from preview", () => {
    const store = opened();
    const { signing, landing, done } = store.getState().callsActions;
    done("SetBio", { height: 1, value: "" });
    landing("SetBio", HASH);
    expect(state(store)).toBe("preview");
    signing("SetBio");
    done("SetBio", { height: 1, value: "" });
    expect(state(store)).toBe("signing");
  });

  it("signs once: a second signing of a card already being signed, landing or done changes nothing", () => {
    const store = opened();
    const { signing, landing, done } = store.getState().callsActions;
    signing("SetBio");
    landing("SetBio", HASH);
    signing("SetBio");
    expect(state(store)).toBe("landing");
    done("SetBio", { height: 5, value: "" });
    signing("SetBio");
    expect(state(store)).toBe("done");
  });

  it("refuses a height that is not a positive whole number", () => {
    const store = opened();
    const { signing, landing, done } = store.getState().callsActions;
    signing("SetBio");
    landing("SetBio", HASH);
    for (const height of [0, -3, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) done("SetBio", { height, value: "" });
    expect(state(store)).toBe("landing");
  });

  it("fails from preview, signing or landing with its reason, its log and the hash once there is one; never from done", () => {
    const store = opened();
    const { failed, signing, landing, done } = store.getState().callsActions;
    failed("SetBio", { reason: "logged-out" });
    expect(card(store)?.state).toEqual({ kind: "failed", reason: "logged-out" });
    store.getState().callsActions.retry("SetBio");
    signing("SetBio");
    failed("SetBio", { reason: "locked" });
    expect(card(store)?.state).toEqual({ kind: "failed", reason: "locked" });
    store.getState().callsActions.retry("SetBio");
    signing("SetBio");
    landing("SetBio", HASH);
    failed("SetBio", { reason: "chain", log: "panic: no", hash: HASH });
    expect(card(store)?.state).toEqual({ kind: "failed", reason: "chain", log: "panic: no", hash: HASH });
    const other = opened();
    other.getState().callsActions.signing("SetBio");
    other.getState().callsActions.landing("SetBio", HASH);
    other.getState().callsActions.done("SetBio", { height: 9, value: "" });
    other.getState().callsActions.failed("SetBio", { reason: "failed" });
    expect(state(other)).toBe("done");
    done("SetBio", { height: 9, value: "" });
  });

  it("goes back from a failure to its preview with its texts, and only from a failure without a hash", () => {
    const store = opened();
    const { edit, signing, failed, retry, landing } = store.getState().callsActions;
    edit("SetBio", 0, "hello");
    signing("SetBio");
    failed("SetBio", { reason: "declined" });
    retry("SetBio");
    expect(card(store)).toMatchObject({ texts: ["hello"], state: { kind: "preview" } });
    signing("SetBio");
    landing("SetBio", HASH);
    failed("SetBio", { reason: "unseen", hash: HASH });
    retry("SetBio");
    expect(state(store)).toBe("failed");
  });

  it("closes a card in preview, failed or done, and never one being signed or landing: Adena and the chain have it", () => {
    const store = opened();
    const { close, signing, landing, failed } = store.getState().callsActions;
    signing("SetBio");
    close("SetBio");
    expect(state(store)).toBe("signing");
    landing("SetBio", HASH);
    close("SetBio");
    expect(state(store)).toBe("landing");
    failed("SetBio", { reason: "unseen", hash: HASH });
    close("SetBio");
    expect(card(store)).toBeUndefined();
    const fresh = opened();
    fresh.getState().callsActions.close("SetBio");
    expect(card(fresh)).toBeUndefined();
  });

  it("keeps two cards apart: what one does changes nothing in the other", () => {
    const store = opened();
    store.getState().callsActions.open({ ...NEW, id: "SetName", func: "SetName" });
    store.getState().callsActions.signing("SetBio");
    expect(state(store, "SetName")).toBe("preview");
    store.getState().callsActions.edit("SetName", 0, "a");
    expect(card(store)?.texts).toEqual([""]);
  });

  it("changes nothing a subscriber can hear when an action changes nothing", () => {
    const store = opened();
    let heard = 0;
    store.subscribe(() => {
      heard += 1;
    });
    const { done, landing, retry, edit } = store.getState().callsActions;
    done("SetBio", { height: 1, value: "" });
    landing("SetBio", HASH);
    retry("SetBio");
    edit("SetBio", 0, "");
    expect(heard).toBe(0);
  });
});

describe("the calls slice: no way back from a call that may have been sent (F5728)", () => {
  it("does not retry a failure of reason maybe-sent, with or without a hash: the same call could be signed twice", () => {
    const store = opened();
    const { signing, failed, retry } = store.getState().callsActions;
    signing("SetBio");
    failed("SetBio", { reason: "maybe-sent" });
    retry("SetBio");
    expect(state(store)).toBe("failed");
    expect(card(store)?.state).toEqual({ kind: "failed", reason: "maybe-sent" });
  });

  it("does not retry a refusal Adena gave once asked to sign: the window closed after Confirm reads so (F5747)", () => {
    const store = opened();
    const { signing, failed, retry } = store.getState().callsActions;
    signing("SetBio");
    failed("SetBio", { reason: "declined-maybe-sent" });
    retry("SetBio");
    expect(card(store)?.state).toEqual({ kind: "failed", reason: "declined-maybe-sent" });
  });
});

// On a shared browser the next person must not meet the last one's cards: a "signed" card of A's, or a preview filled with
// A's arguments. A card has no account, so one waiting for its block (signing, landing) stays, as its transaction is in flight
// and dropping it would lose track of it; the idle ones (preview, failed, done) go, as the link cards go (cardsSlice).
describe("a change of account", () => {
  const A = Address.parse("g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv");
  const B = Address.parse("g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5");
  const idle = (store: CallsStore) => {
    const { open, edit, signing, landing, done, failed } = store.getState().callsActions;
    for (const id of ["preview", "failed", "done", "signing", "landing"]) open({ ...NEW, id });
    edit("preview", 0, "A's private words");
    failed("failed", { reason: "unseen" });
    for (const id of ["done", "signing", "landing"]) signing(id);
    landing("done", HASH);
    landing("landing", HASH);
    done("done", { height: 7, value: "" });
  };

  it("drops A's idle cards when B signs in: a preview, a failure and a signed card", () => {
    const store = made();
    store.getState().loginActions.signedIn(A);
    idle(store);
    store.getState().loginActions.signedIn(B);
    expect(Object.keys(store.getState().calls).sort()).toEqual(["landing", "signing"]);
  });

  it("drops A's idle cards when A signs out, for the guest who follows on a shared browser", () => {
    const store = made();
    store.getState().loginActions.signedIn(A);
    idle(store);
    store.getState().loginActions.signedOut();
    expect(Object.keys(store.getState().calls).sort()).toEqual(["landing", "signing"]);
  });

  it("keeps the cards of the same account signing in again, and of the first session from none", () => {
    const store = made();
    idle(store);
    store.getState().loginActions.signedIn(A);
    expect(Object.keys(store.getState().calls)).toHaveLength(5);
    store.getState().loginActions.signedIn(A);
    expect(Object.keys(store.getState().calls)).toHaveLength(5);
  });
});
