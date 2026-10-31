// The origins connect-src names beside 'self' (slice 5 part 2, 5g, 5k): the universes' https RPC and their chains' public
// indexers, read from the data at build.
// The data's `rpc` ends up in a header, so only a bare lower-case https host and port is ever written (csp.ts holds the rest).
import { indexerOf } from "./lib/chain/indexerOf.ts";

// A bare https origin as a CSP source list takes it: a lower-case host of letters, digits, dots and hyphens, an optional port,
// and nothing else (no wildcard, path, quote, space, `;` or `,`).
function isOrigin(origin: string): boolean {
  return /^https:\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)*(?::[0-9]{1,5})?$/.test(origin);
}

/**
 * The https origins of the universes' RPC, each once, in code-unit order (not a locale's: every machine writes the same bytes),
 * the default port dropped. An RPC that is no https URL, or whose origin is no bare host and port (a wildcard, a `;`, a quote, a
 * comma, a user), stops the build, naming it.
 */
export function rpcOrigins(universes: readonly { readonly rpc: string }[]): string[] {
  const found = new Set<string>();
  for (const { rpc } of universes) {
    let origin: string;
    try {
      const url = new URL(rpc);
      if (url.protocol !== "https:" || url.username !== "" || url.password !== "") throw new RangeError("not https");
      origin = url.origin;
    } catch (error) {
      throw new RangeError(`csp: the rpc ${JSON.stringify(rpc)} is no https URL`, { cause: error });
    }
    if (!isOrigin(origin)) throw new RangeError(`csp: the rpc ${JSON.stringify(rpc)} has no plain host to name`);
    found.add(origin);
  }
  return [...found].sort();
}

/**
 * The origins connect-src names: the RPC of each universe and the public indexer of its chain (lib/chain/indexerOf.ts, none for a
 * chain it does not know), each once, in code-unit order. A universe's RPC is checked as `rpcOrigins` does.
 */
export function connectOrigins(universes: readonly { readonly rpc: string; readonly chainId: string }[]): string[] {
  const indexers = universes
    .flatMap(({ chainId }) => indexerOf(chainId) ?? [])
    .map((address) => new URL(address).origin);
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
