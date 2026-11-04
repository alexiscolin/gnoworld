import { describe, expect, it } from "vitest";
import { QueryAnswer, StatusAnswer } from "./chain.ts";
import { FunctionList } from "./functions.ts";

// 5g-reads: the three shapes the browser reads from a chain's RPC. The bodies are written the way gno's source at v1.5.0 gives them
// (see app/tests/chain/chainFixture.ts: the envelopes are read from source, not recorded). Fields the reader does not read may
// be there or not; only the ones it reads decide whether an answer is the right shape.
const envelope = (base: Record<string, unknown>) => ({
  jsonrpc: "2.0",
  id: "",
  result: { response: { ResponseBase: base, Key: null, Value: null, Proof: null, Height: "0" } },
});
const GOOD_BASE = { Error: null, Data: "aGVsbG8=", Events: null, Log: "", Info: "" };

describe("QueryAnswer, the envelope the three abci_query reads share", () => {
  it("takes an answer with data", () => {
    expect(QueryAnswer.safeParse(envelope(GOOD_BASE)).success).toBe(true);
  });

  it("takes an empty page: Data is the empty string", () => {
    expect(QueryAnswer.safeParse(envelope({ ...GOOD_BASE, Data: "" })).success).toBe(true);
  });

  it("takes a refusal: Data null with an Error that has its @type", () => {
    const refused = envelope({ ...GOOD_BASE, Data: null, Error: { "@type": "/vm.InvalidPkgPathError" } });
    expect(QueryAnswer.safeParse(refused).success).toBe(true);
  });

  it("takes a StringError that carries its value", () => {
    const refused = envelope({ ...GOOD_BASE, Data: null, Error: { "@type": "/abci.StringError", value: "boom" } });
    expect(QueryAnswer.safeParse(refused).success).toBe(true);
  });

  it("takes a JSON-RPC failure: an error and no result (HTTP 200, handlers.go:393)", () => {
    const failure = { jsonrpc: "2.0", id: "", error: { code: -32603, message: "boom", data: "boom" } };
    expect(QueryAnswer.safeParse(failure).success).toBe(true);
  });

  it("takes neither result nor error as a shape: the reader decides what that means", () => {
    expect(QueryAnswer.safeParse({ jsonrpc: "2.0", id: "" }).success).toBe(true);
  });

  it("lets an added field pass without carrying it on", () => {
    const parsed = QueryAnswer.parse({ ...envelope({ ...GOOD_BASE, Extra: "x" }), surprise: "y" });
    expect(JSON.stringify(parsed)).not.toContain("surprise");
    expect(JSON.stringify(parsed)).not.toContain("Extra");
  });

  it.each([
    ["Data a number", envelope({ ...GOOD_BASE, Data: 5 })],
    ["Data an object", envelope({ ...GOOD_BASE, Data: {} })],
    ["Error a string", envelope({ ...GOOD_BASE, Error: "boom" })],
    ["an Error without its @type", envelope({ ...GOOD_BASE, Data: null, Error: { value: "boom" } })],
    ["an Error whose @type is a number", envelope({ ...GOOD_BASE, Data: null, Error: { "@type": 5 } })],
    [
      "a StringError whose value is a number",
      envelope({ ...GOOD_BASE, Data: null, Error: { "@type": "/abci.StringError", value: 5 } }),
    ],
    ["no ResponseBase", { jsonrpc: "2.0", result: { response: {} } }],
    ["a result that is a string", { jsonrpc: "2.0", result: "ok" }],
    ["an error that is a string", { jsonrpc: "2.0", error: "boom" }],
    ["an array", []],
    ["null", null],
    ["a string", "hello"],
  ])("refuses %s", (_name, body) => {
    expect(QueryAnswer.safeParse(body).success).toBe(false);
  });
});

describe("FunctionList, the body of vm/qfuncs", () => {
  const fn = (extra: Record<string, unknown>) => ({ FuncName: "TotalSupply", Params: null, Results: [], ...extra });

  it("takes a list of functions", () => {
    const list = [fn({}), fn({ FuncName: "BalanceOf", Params: [{ Name: "owner", Type: "address", Value: "" }] })];
    expect(FunctionList.safeParse(list).success).toBe(true);
  });

  it("takes the text null: a realm with no exported function (keeper.go:1812)", () => {
    expect(FunctionList.safeParse(null).success).toBe(true);
  });

  it("takes an empty list", () => {
    expect(FunctionList.safeParse([]).success).toBe(true);
  });

  it("takes Params and Results as null: a nil Go list is null (amino/json_encode.go:262)", () => {
    expect(FunctionList.safeParse([fn({ Params: null, Results: null })]).success).toBe(true);
  });

  it("lets an added field pass without carrying it on", () => {
    const parsed = FunctionList.parse([fn({ Surprise: "y" })]);
    expect(JSON.stringify(parsed)).not.toContain("Surprise");
  });

  it.each([
    ["an object", { FuncName: "A" }],
    ["a string", "A"],
    ["a list of strings", ["A"]],
    ["a function without its name", [{ Params: null, Results: null }]],
    ["a name that is a number", [fn({ FuncName: 5 })]],
    ["Params that is a string", [fn({ Params: "none" })]],
    ["Params whose entries are strings", [fn({ Params: ["cur"] })]],
    ["Results that is a string", [fn({ Results: "none" })]],
    ["a parameter without its Name", [fn({ Params: [{ Type: "int" }] })]],
    ["a parameter whose Type is a number", [fn({ Params: [{ Name: "a", Type: 5 }] })]],
  ])("refuses %s", (_name, body) => {
    expect(FunctionList.safeParse(body).success).toBe(false);
  });
});

describe("StatusAnswer, the node's /status", () => {
  const status = (sync: Record<string, unknown>) => ({
    jsonrpc: "2.0",
    id: "",
    result: { sync_info: sync, build_version: "" },
  });
  const SYNC = { latest_block_height: "786661", latest_block_time: "2026-10-30T23:43:10Z", catching_up: false };

  it("takes the height and the block's time", () => {
    expect(StatusAnswer.safeParse(status(SYNC)).success).toBe(true);
  });

  it("takes a time with fractional digits: the chain writes 0, 3, 6 or 9 of them", () => {
    const sync = { ...SYNC, latest_block_time: "2026-10-30T23:43:10.123456789Z" };
    expect(StatusAnswer.safeParse(status(sync)).success).toBe(true);
  });

  it("lets an added field pass without carrying it on", () => {
    const parsed = StatusAnswer.parse(status({ ...SYNC, surprise: "y" }));
    expect(JSON.stringify(parsed)).not.toContain("surprise");
  });

  // The node's network, its chain's id (D118): read when the status names it, which a universe's check needs; a status
  // that names none is still a status, whose check refuses it.
  it("takes the node's network when its status names it, and none when it does not", () => {
    const named = {
      ...status(SYNC),
      result: { ...status(SYNC).result, node_info: { network: "onyx-1", moniker: "x" } },
    };
    expect(StatusAnswer.parse(named).result.node_info).toEqual({ network: "onyx-1" });
    expect(StatusAnswer.parse(status(SYNC)).result.node_info).toBeUndefined();
  });

  it.each([5, null, ["onyx-1"]])("refuses a network that is no text: %j", (network) => {
    const odd = { ...status(SYNC), result: { ...status(SYNC).result, node_info: { network } } };
    expect(StatusAnswer.safeParse(odd).success).toBe(false);
  });

  it.each([
    ["a height that is a number", status({ ...SYNC, latest_block_height: 786661 })],
    ["no height", status({ latest_block_time: SYNC.latest_block_time })],
    ["no time", status({ latest_block_height: SYNC.latest_block_height })],
    ["a time that is a number", status({ ...SYNC, latest_block_time: 5 })],
    ["no sync_info", { jsonrpc: "2.0", result: {} }],
    ["no result", { jsonrpc: "2.0", error: { code: -1, message: "x" } }],
    ["null", null],
  ])("refuses %s", (_name, body) => {
    expect(StatusAnswer.safeParse(body).success).toBe(false);
  });
});
