// A realm's last five calls (D375): who, which function, how many blocks ago (the indexer has no time, F2950). One request for the page view,
// asked of the indexer with its limit and order, kept in memory per realm for the session (useLastCalls.ts); no timer. A realm never called, or a read that fails,
// draws nothing, and the page stands without it.
import { shortAddress } from "@gnoworld/schemas";
import type { Worlds } from "@gnoworld/schemas/indexer";
import { Kicker, Row, Stack } from "@gnoworld/ui";
import { useLastCalls } from "./useLastCalls.ts";

// The names the file holds for addresses (a deployer's), indexed once per file.
const named = new WeakMap<Worlds["worlds"], Map<string, string>>();

function namesOf(worlds: Worlds["worlds"]): Map<string, string> {
  const kept = named.get(worlds);
  if (kept !== undefined) return kept;
  const names = new Map<string, string>();
  for (const { realms } of worlds) {
    for (const { deployer, deployerName } of realms) {
      if (deployer !== null && deployerName !== null) names.set(deployer, deployerName);
    }
  }
  named.set(worlds, names);
  return names;
}

const ago = (blocks: number): string => {
  if (blocks <= 0) return "this block";
  return `${blocks.toLocaleString("en-US")} ${blocks === 1 ? "block" : "blocks"} ago`;
};

export interface LastCallsProps {
  realm: string;
  /** The realm's indexer, from its chain. */
  indexer: string;
  /** The worlds' file, once it has come: it names the callers it knows. */
  worlds: Worlds["worlds"] | undefined;
}

export default function LastCalls({ realm, indexer, worlds }: LastCallsProps) {
  const answer = useLastCalls(indexer, realm);
  const names = worlds === undefined ? undefined : namesOf(worlds);
  // Nothing to list, or a read that failed, draws nothing: a realm nobody called says so on the plate's standing (D530), and the page's
  // one error line is the Render card's (D534).
  if (answer === undefined || !answer.ok || answer.value.calls.length === 0) return null;
  return (
    <Stack space="xs">
      <Kicker dot="world">Last calls</Kicker>
      <div>
        {answer.value.calls.map(({ caller, func, height }, at) => (
          <Row
            key={`${String(height)}-${String(at)}`}
            look="divided"
            title={names?.get(caller) ?? shortAddress(caller)}
            subtitle={`${func} · ${ago(answer.value.tip - height)}`}
            subtitleLook="label"
          />
        ))}
      </div>
    </Stack>
  );
}
