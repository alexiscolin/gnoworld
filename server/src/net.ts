// The one way out of the server (ADR-0002 §7): a call carries its timeout and follows no redirect,
// whatever the caller asks. Where it may go is the egress proxy's to decide (slice 3e).
export function send(url: string, init: RequestInit, ms: number): Promise<Response> {
  return fetch(url, { ...init, signal: AbortSignal.timeout(ms), redirect: "error" });
}
