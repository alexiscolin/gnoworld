// A realm's facts from the public indexer (5k, ADR-0002 §4): its path, its deployer, its first block, each
// one drawn only when the indexer gave it (never a zero in its place), with the source and the time of the read. Everything the
// indexer returns is text, in left-to-right, in an element of its own.
import type { RealmFactsValue } from "@gnoworld/schemas/indexer";
import type { ChainRead } from "../../lib/chain/read.ts";
import { ReadFailed, ReadSource } from "./ReadSource.tsx";

export type { RealmFactsValue };

const grouped = (n: number): string => n.toLocaleString("en-US");

function Fact({ label, children, ltr = false }: { label: string; children: string; ltr?: boolean }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd {...(ltr ? { dir: "ltr" } : {})}>{children}</dd>
    </div>
  );
}

export function RealmFacts({ read }: { read: ChainRead<RealmFactsValue> }) {
  if (!read.ok) return <ReadFailed failure={read.failure} source={read.source} role="status" />;
  const { path, deployer, firstBlock } = read.value;
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
      </dl>
      <ReadSource source={read.source} />
    </section>
  );
}
