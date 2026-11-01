// The origins connect-src names beside 'self' (slice 5 part 2, 5g, 5k): the universes' https RPC and their chains' public
// indexers, both read from the data at build.
// The data's `rpc` and `indexer` end up in a header, so only a bare lower-case https host and port is ever written (csp.ts holds the rest).

import { isPublicOrigin } from "@gnoworld/core";

// A bare https origin on a public name, as a CSP source list takes it (F2819: the rule is core's, shared with the server).
function isOrigin(origin: string): boolean {
  return isPublicOrigin(origin);
}

/**
 * The https origins of the universes' RPC, each once, in code-unit order (not a locale's: every machine writes the same bytes),
 * the default port dropped. An RPC that is no https URL, or whose origin is no bare host and port (a wildcard, a `;`, a quote, a
 * comma, a user), stops the build, naming it.
 */
export function rpcOrigins(universes: readonly { readonly rpc: string }[]): string[] {
  return [...new Set(universes.map(({ rpc }) => originOfAddress("rpc", rpc)))].sort();
}

// The https origin of a universe's address (`what` names the field in a refusal), or a RangeError naming it.
function originOfAddress(what: "rpc" | "indexer", address: string): string {
  let origin: string;
  try {
    const url = new URL(address);
    if (url.protocol !== "https:" || url.username !== "" || url.password !== "") throw new RangeError("not https");
    origin = url.origin;
  } catch (error) {
    throw new RangeError(`csp: the ${what} ${JSON.stringify(address)} is no https URL`, { cause: error });
  }
  if (!isOrigin(origin)) throw new RangeError(`csp: the ${what} ${JSON.stringify(address)} has no plain host to name`);
  return origin;
}

/**
 * The origins connect-src names: the RPC of each universe and the public indexer of its chain, both from the data, each once, in
 * code-unit order. Each is checked as `rpcOrigins` does: an `indexer` that is no https URL with a plain host stops the build.
 */
export function connectOrigins(universes: readonly { readonly rpc: string; readonly indexer: string }[]): string[] {
  const indexers = universes.map(({ indexer }) => originOfAddress("indexer", indexer));
  return [...new Set([...rpcOrigins(universes), ...indexers])].sort();
}

/** The connect-src directive: 'self', then each origin once, in code-unit order; an origin that is not bare refuses. */
export function connectSrc(origins: readonly string[]): string {
  for (const origin of origins) {
    if (!isOrigin(origin)) throw new RangeError(`csp: ${JSON.stringify(origin)} is no bare https origin`);
  }
  return ["connect-src 'self'", ...[...new Set(origins)].sort()].join(" ");
}

/** The origins a policy's connect-src names beside 'self'. */
export function originsOf(csp: string): string[] {
  const directive = csp.split("; ").find((part) => part.startsWith("connect-src ")) ?? "";
  return directive.split(" ").filter((source) => source.startsWith("https://"));
}
