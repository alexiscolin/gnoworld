// The proof's verifier (ADR-0002 §4), apart from the login so that file stays small.
import { verifyArbitrarySignature } from "@adena-wallet/sdk";
import type { Address, Proof } from "@gnoworld/schemas";

export interface Expected {
  signer: Address;
  chainId: string;
  data: string;
}
export type Verify = (proof: Proof, expected: Expected) => Promise<boolean>;

// The SDK's verifier says yes when told nothing to check (ADR-0002 §4): here all three are required.
export const verifyProof: Verify = async (proof, { signer, chainId, data }) =>
  verifyArbitrarySignature(proof, { signer, chainId, data });

// The verifier's answer, a refusal when it throws: the SDK's never does, but a proof must not depend on it.
export async function verifies<P = Proof>(
  verify: (proof: P, expected: Expected) => Promise<boolean>,
  proof: P,
  expected: Expected,
): Promise<boolean> {
  try {
    return await verify(proof, expected);
  } catch {
    return false;
  }
}
