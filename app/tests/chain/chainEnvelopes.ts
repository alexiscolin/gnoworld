// The envelopes around chainFixture.ts's answers: NOT recordings, written from gno's source at v1.5.0 (file:line beside each).

const base64Of = (text: string): string =>
  btoa(Array.from(new TextEncoder().encode(text), (byte) => String.fromCharCode(byte)).join(""));

interface Query {
  /** The body, as gnomcp gave it decoded; null for a refused read. */
  data: string | null;
  /** A refusal's `@type`; its `value` is what a StringError carries (json_encode.go:453). */
  error?: { "@type": string; value?: string };
  log?: string;
}

// NOT recorded, written from v1.5.0: RPCResponse lib/types/types.go:158, id "" handlers.go:424, `response` core/types/responses.go:278,
// abci/types/types.go:105,169 under Go's field names (amino/codec.go:841), an int64 as a string (json_encode.go:87), []byte as base64
// (json_encode.go:283), a nil slice as null (json_encode.go:262). vm's handlers set no Height (handler.go:181, gnokey's "height: 0").
export function queryEnvelope({ data, error, log = "" }: Query) {
  return {
    jsonrpc: "2.0",
    id: "",
    result: {
      response: {
        ResponseBase: {
          Error: error ?? null,
          Data: data === null ? null : base64Of(data),
          Events: null,
          Log: log,
          Info: "",
        },
        Key: null,
        Value: null,
        Proof: null,
        Height: "0",
      },
    },
  };
}

// NOT recorded, written from v1.5.0: SyncInfo core/types/responses.go:144, ResultStatus :160. Fields this reader does not read are
// left out. gnomcp gives whole seconds; the chain writes 0, 3, 6 or 9 fractional digits (amino/wellknown.go:422-428).
export function statusEnvelope(height: number, time: string) {
  return {
    jsonrpc: "2.0",
    id: "",
    result: {
      sync_info: {
        latest_block_hash: "",
        latest_app_hash: "",
        latest_block_height: String(height),
        latest_block_time: time,
        catching_up: false,
      },
      build_version: "",
    },
  };
}

// NOT recorded, written from v1.5.0: a bad parameter or a failed query answers HTTP 200 with `error` and no result (handlers.go:393,413;
// lib/types/types.go:143,158).
export function rpcErrorEnvelope(message: string) {
  return { jsonrpc: "2.0", id: "", error: { code: -32603, message, data: message } };
}
