import type { FailureKind } from "@gnoworld/chain/read";

// Every kind of failure a read has: a new kind is a type error here until it is listed.
const KINDS: Record<FailureKind, true> = {
  refused: true,
  down: true,
  timeout: true,
  "too-big": true,
  "not-json": true,
  "wrong-shape": true,
  "no-realm": true,
  "no-page": true,
  "chain-refused": true,
  "bad-name": true,
  "other-chain": true,
  "not-landed": true,
};

export const FAILURE_KINDS = Object.keys(KINDS) as FailureKind[];
