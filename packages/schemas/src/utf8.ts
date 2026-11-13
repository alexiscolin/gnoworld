// Bytes read as UTF-8 text strictly, as JSON is: a byte that is no UTF-8 refuses the whole, never turned into U+FFFD. Here and not in
// core, which has no TextDecoder and whose lint refuses to declare one; every reader of outside bytes imports this package already.
import { jsonOf } from "@gnoworld/core";

// The host's TextDecoder, which this package's lib (no DOM, no Node types) does not declare.
declare const TextDecoder: new (label: "utf-8", options: { fatal: true }) => { decode(bytes: Uint8Array): string };

/** The text `bytes` hold in UTF-8 (a leading byte-order mark dropped), or null for bytes that are no UTF-8. */
export function strictUtf8(bytes: Uint8Array): string | null {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

/** The value the JSON in `bytes` writes; undefined for bytes that are no UTF-8 or no JSON, never an error. */
export function jsonOfBytes(bytes: Uint8Array): unknown {
  const text = strictUtf8(bytes);
  return text === null ? undefined : jsonOf(text);
}
