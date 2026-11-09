// The byline of a realm's plate (D375, frames 26 and 93): who made it, its version and what it holds, once the file has come. Its figures are
// features/realms/RealmStanding.tsx, in a chunk of its own: the first screen holds neither the indexer's reads nor their schemas.
import { lazy, Suspense } from "react";
import { Cluster, Stack } from "@gnoworld/ui";
import type { Worlds } from "@gnoworld/schemas/indexer";

type Held = Worlds["worlds"][number]["realms"][number];

const VersionChip = lazy(() => import("../features/realms/VersionChip.tsx"));

/** "by @namespace" and, beside it, the realm's version family once the file has come. */
export function ByLine({
  namespace,
  realm,
  worlds,
  prefix,
  held,
}: {
  namespace: string;
  realm: string;
  worlds: Worlds["worlds"] | undefined;
  prefix: string;
  /** What the file holds of it: its functions and imports, counted. */
  held?: Held | undefined;
}) {
  const count = (n: number, one: string) => `${String(n)} ${one}${n === 1 ? "" : "s"}`;
  return (
    <Stack space="2xs">
      <Cluster space="s">
        {/* Its styles join here when Discover's styleOf stands in core (D373); until then who put it there. */}
        <p>by @{namespace}</p>
        {worlds === undefined ? null : (
          <Suspense fallback={null}>
            <VersionChip realm={realm} worlds={worlds} prefix={prefix} />
          </Suspense>
        )}
      </Cluster>
      {held === undefined ? null : (
        <p className="label">
          {count(held.functions.length, "function")} · {count(held.imports.length, "import")}
        </p>
      )}
    </Stack>
  );
}
