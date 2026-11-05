import { callArgs, callFields, realmType, textProblem } from "@gnoworld/core";
import { Address, CallRequest } from "@gnoworld/schemas";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { transaction } from "../../lib/adena/call.ts";
import { callRequest, preview } from "./request.ts";

// 9d: the preview and the message are made from one CallRequest, so the card cannot show one call and sign another.
const CALLER = Address.parse("g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5");
const ONYX = { chainId: "onyx-1", name: "Onyx", rpc: "https://rpc.onyx.testnets.gno.land:443" };
const CUR = { Name: "cur", Type: realmType() };
const PARAMS = [CUR, { Name: "bio", Type: "string" }, { Name: "times", Type: "int64" }, { Name: "loud", Type: "bool" }];
const CARD = { realm: "gno.land/r/demo/profile", func: "SetBio", params: PARAMS };
const WHO = { chainId: "onyx-1", caller: CALLER };

describe("callRequest: the card's texts as the one CallRequest", () => {
  it("builds the request from the universe's chain, the caller, the realm, the function and the texts unchanged", () => {
    const built = callRequest({ ...CARD, texts: [" hello\nworld ", "-5", "true"] }, WHO);
    expect(built).toEqual({
      ok: true,
      request: {
        chainId: "onyx-1",
        caller: CALLER,
        realm: CARD.realm,
        func: "SetBio",
        args: [" hello\nworld ", "-5", "true"],
      },
    });
    expect(CallRequest.safeParse(built.ok ? built.request : null).success).toBe(true);
  });

  it("gives the problems of the texts, one a field, and no request, so nothing is asked of Adena", () => {
    const built = callRequest({ ...CARD, texts: ["ok", "5.5", "maybe"] }, WHO);
    expect(built.ok).toBe(false);
    if (built.ok) return;
    expect(built.problems).toHaveLength(3);
    expect(built.problems[0]).toBeUndefined();
    expect(built.problems[1]).toBeDefined();
    expect(built.problems[2]).toBe("format");
  });

  it("gives no request for no texts, or for more texts than fields: a missing text is its field's own problem", () => {
    const empty = callRequest({ ...CARD, texts: [] }, WHO);
    expect(empty.ok).toBe(false);
    expect(empty.ok ? [] : empty.problems).toEqual([undefined, "format", "format"]);
    expect(callRequest({ ...CARD, texts: ["a", "1", "true", "extra"] }, WHO).ok).toBe(false);
  });

  it("gives the problem of a text a CallRequest refuses under its field: a hidden character is malformed, 8,193 bytes long", () => {
    const hidden = callRequest({ ...CARD, texts: [`a${String.fromCodePoint(0x202e)}b`, "1", "true"] }, WHO);
    expect(hidden.ok ? [] : hidden.problems).toEqual(["malformed", undefined, undefined]);
    const long = callRequest({ ...CARD, texts: ["a".repeat(8193), "1", "true"] }, WHO);
    expect(long.ok ? [] : long.problems).toEqual(["long", undefined, undefined]);
  });

  it("gives no request for a call that is not one the card carries (a read, a type gnoweb opens)", () => {
    expect(callRequest({ ...CARD, params: [{ Name: "x", Type: "string" }], texts: ["a"] }, WHO)).toMatchObject({
      ok: false,
    });
    expect(
      callRequest({ ...CARD, params: [CUR, { Name: "m", Type: "map[string]string" }], texts: ["a"] }, WHO),
    ).toMatchObject({
      ok: false,
    });
  });

  it("gives no request for a text a CallRequest refuses, whatever the field's kind allows: 8,193 bytes, a hidden character", () => {
    expect(callRequest({ ...CARD, texts: ["a".repeat(8193), "1", "true"] }, WHO).ok).toBe(false);
    expect(callRequest({ ...CARD, texts: [`a${String.fromCodePoint(0x202e)}b`, "1", "true"] }, WHO).ok).toBe(false);
  });
});

describe("preview: what the card shows, from the request", () => {
  it("names the realm, the function, the arguments, the network (its name and chain) and the fee, as the message has them", () => {
    const request = CallRequest.parse({
      chainId: "onyx-1",
      caller: CALLER,
      realm: CARD.realm,
      func: "SetBio",
      args: ["hi", "1", "false"],
    });
    expect(preview(request, ONYX, "≈ 0.05 GNOT")).toEqual({
      realm: CARD.realm,
      func: "SetBio",
      args: ["hi", "1", "false"],
      network: "Onyx (onyx-1)",
      fee: "≈ 0.05 GNOT",
    });
  });

  it("equals the message Adena is sent, whatever is typed: realm, function, arguments in order, and the chain", () => {
    const run = fc.check(
      fc.property(
        fc.string({ unit: "grapheme", maxLength: 40 }),
        fc.bigInt({ min: -(2n ** 63n), max: 2n ** 63n - 1n }),
        fc.boolean(),
        (bio, times, loud) => {
          const texts = [bio, String(times), String(loud)];
          const built = callRequest({ ...CARD, texts }, WHO);
          // A text a CallRequest refuses is no request; every other one is previewed as it is signed.
          if (!built.ok) return true;
          const shown = preview(built.request, ONYX, "x");
          const sent = transaction(built.request, ONYX);
          const [message] = sent.messages;
          return (
            shown.realm === message?.value.pkg_path &&
            shown.func === message.value.func &&
            JSON.stringify(shown.args) === JSON.stringify(message.value.args) &&
            shown.network.includes(sent.networkInfo.chainId) &&
            JSON.stringify(shown.args) === JSON.stringify(texts)
          );
        },
      ),
    );
    expect(run.failed).toBe(false);
  });

  it("agrees with the CallRequest on any text: what the card calls a problem, the request refuses, and no other", () => {
    const run = fc.check(
      fc.property(fc.string({ unit: "binary", maxLength: 30 }), (text) => {
        const request = { chainId: "onyx-1", caller: CALLER, realm: CARD.realm, func: "SetBio", args: [text] };
        return (textProblem(text) === undefined) === CallRequest.safeParse(request).success;
      }),
    );
    expect(run.failed).toBe(false);
    const long = { chainId: "onyx-1", caller: CALLER, realm: CARD.realm, func: "SetBio", args: ["a".repeat(8193)] };
    expect([textProblem("a".repeat(8193)), CallRequest.safeParse(long).success]).toEqual(["long", false]);
  });

  it("is built from callArgs's own answer: the arguments are the texts callArgs accepted, nothing converted", () => {
    const texts = ["x", "007", "true"];
    expect(callArgs(PARAMS, texts)).toMatchObject({ ok: false });
    expect(callRequest({ ...CARD, texts }, WHO).ok).toBe(false);
    expect(callFields(PARAMS)).toMatchObject({ ok: true });
  });
});
