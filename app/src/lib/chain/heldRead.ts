import type { ChainRead } from "@gnoworld/chain/read";

/** A read kept in `held` under `key` while it is asked and after; a failed read is dropped, so it is asked again. */
export function heldRead<V>(
  held: Map<string, Promise<ChainRead<V>>>,
  key: string,
  start: () => Promise<ChainRead<V>>,
): Promise<ChainRead<V>> {
  const kept = held.get(key);
  if (kept !== undefined) return kept;
  const asked = start();
  held.set(key, asked);
  asked.then(
    (answer) => {
      if (!answer.ok) held.delete(key);
    },
    () => held.delete(key),
  );
  return asked;
}
