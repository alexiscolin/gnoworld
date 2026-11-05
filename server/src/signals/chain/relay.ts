// What the subscription's reads become on the stream (slice 9g): each event told as it is, with its block's height, coalesced to 4
// a second a room (a flood of one world cannot starve another's, nor the ticker's deploys); and the Earth's 24 h count, from block
// times only: a transaction carries none, so a deploy waits for its block's frame, then is counted whether or not the ticker
// was told of it (the count is the chain's truth).
import type { ChainEvent, RealmsDeployed } from "@gnoworld/schemas";
import { makeCoalescer } from "./coalesce.ts";
import type { Deploy } from "./count.ts";
import type { ChainRead } from "./message.ts";

export interface RelayOptions {
  stream: { chain: (event: ChainEvent) => void; realms: (count: RealmsDeployed) => void };
  count: { deployed: (deploy: Deploy) => void; count: () => number; known: () => boolean };
  universe: string;
  now: () => number;
}

// A world's slug is never one of these: the ticker's deploys and the count have budgets of their own.
const DEPLOYS = "#deploys";
const COUNT = "#count";
/** Deploys waiting for their block's frame, and blocks' times remembered for the deploys that come after. */
const WAITING = 1000;
const BLOCKS = 100;

export function makeRelay({ stream, count, universe, now }: RelayOptions): (read: ChainRead) => void {
  const room = makeCoalescer({ now });
  const waiting: { height: number; id: string }[] = [];
  const blocks = new Map<number, string>();
  // The count last told: a count that did not change is not told again.
  let told: number | undefined;
  const tell = (height: number): void => {
    if (!count.known()) return;
    const total = count.count();
    if (total === told || !room.admit(COUNT)) return;
    told = total;
    stream.realms({ universe, count: total, height });
  };
  // A deploy is counted when its block's time is known: now, or when its block's frame comes.
  const countDeploy = (event: Extract<ChainEvent, { kind: "deploy" }>): number | undefined => {
    const time = blocks.get(event.height);
    if (time === undefined) {
      waiting.push({ height: event.height, id: event.realm });
      if (waiting.length > WAITING) waiting.shift();
      return undefined;
    }
    count.deployed({ height: event.height, time, id: event.realm });
    return event.height;
  };
  const arrived = ({ height, time }: { height: number; time: string }): void => {
    blocks.set(height, time);
    if (blocks.size > BLOCKS) blocks.delete(blocks.keys().next().value ?? 0);
    for (const { id } of waiting.filter((each) => each.height === height)) count.deployed({ height, time, id });
    waiting.splice(0, waiting.length, ...waiting.filter((each) => each.height !== height));
  };
  return ({ events, block }) => {
    let counted: number | undefined;
    for (const event of events) {
      if (event.kind === "call") {
        if (room.admit(event.world, event.actor)) stream.chain(event);
        continue;
      }
      if (room.admit(DEPLOYS, event.actor)) stream.chain(event);
      counted = countDeploy(event) ?? counted;
    }
    if (block !== undefined) arrived(block);
    const at = block?.height ?? counted;
    if (at !== undefined) tell(at);
  };
}
