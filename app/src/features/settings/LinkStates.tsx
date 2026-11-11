// The two ends both ways of linking share: the account is linked, and the session is too old to change links, which a new login mends.
import { shortAddress, type Address } from "@gnoworld/schemas";
import { Button, Cluster, Stack } from "@gnoworld/ui";
import type { ReactNode } from "react";
import { linkProblem } from "./linkWords.ts";

export function Linked({ address }: { address: Address }) {
  return (
    <p role="status">
      {shortAddress(address)} is linked. You moderate the rooms of every world any of your linked accounts owns.
    </p>
  );
}

export function Stale({ again, children }: { again: { ask: () => void; waiting: boolean }; children?: ReactNode }) {
  return (
    <Stack space="s">
      <p role="status">{linkProblem("unauthenticated")}</p>
      {children}
      <Cluster justify="end">
        <Button emphasis="solid" onClick={again.ask} disabled={again.waiting}>
          Sign in again to confirm
        </Button>
      </Cluster>
    </Stack>
  );
}
