// A realm's facts from the public indexer (5k, ADR-0002 §4): its path, its deployer, its first block and its calls in 24 h, each
// one drawn only when the indexer gave it (never a zero in its place), with the source and the time of the read. Everything the
// indexer returns is text, in left-to-right, in an element of its own.
import type { RealmFactsValue } from "@gnoworld/schemas";
import type { ChainRead } from "../../lib/chain/read.ts";
import { ReadFailed, ReadSource } from "./ReadSource.tsx";

export type { RealmFactsValue };

const grouped = (n: number): string => n.toLocaleString("en-US");

// A count is a finite whole number of 0 or more; anything else is no fact.
const count = (given: number | undefined): number | undefined =>
  given !== undefined && Number.isSafeInteger(given) && given >= 0 ? given : undefined;

function Fact({ label, children, ltr = false }: { label: string; children: string; ltr?: boolean }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd {...(ltr ? { dir: "ltr" } : {})}>{children}</dd>
    </div>
  );
}

export function RealmFacts({ read }: { read: ChainRead<RealmFactsValue> }) {
  if (!read.ok) return <ReadFailed failure={read.failure} source={read.source} />;
  const { path, deployer } = read.value;
  const firstBlock = count(read.value.firstBlock);
  const calls = count(read.value.callsPerDay);
  return (
    <section aria-label="Facts from the indexer">
      <dl>
        {path === undefined ? null : (
          <Fact label="Path" ltr>
            {path}
          </Fact>
        )}
        {deployer === undefined ? null : (
          <Fact label="Deployer" ltr>
            {deployer}
          </Fact>
        )}
        {firstBlock === undefined ? null : <Fact label="First block">{grouped(firstBlock)}</Fact>}
        {calls === undefined ? null : <Fact label="Calls in 24 h">{grouped(calls)}</Fact>}
      </dl>
      <ReadSource source={read.source} />
    </section>
  );
}
