// A guest's line said by the bot (D430): one RELAYMSG with a label of its own, settled by the line Ergo answers it with.
import type { Socket } from "node:net";
import { allowed, line } from "./lines.ts";
import type { State } from "./session.ts";

// The relays waiting for Ergo at once, at most: a guest's line past it is not taken, so a silent Ergo grows nothing.
const RELAYS_MAX = 500;

/** What a relay comes to: the id Ergo gave the line (empty when it sent none), a refusal, or no word in time (the line may still come). */
export type Relayed = { msgid: string } | false | "unsure";

/** How long Ergo has to answer a relayed line. */
export const RELAY_MS = 5000;

/** False for a form the lines refuse, a room the bot is not in, too many waiting, or Ergo's refusal; "unsure" for no answer
 * within `ms` or a connection that ended; else the line's id. */
export function relayer(
  state: State,
  socket: () => Socket | undefined,
  ms: number,
): (room: string, nick: string, text: string) => Promise<Relayed> {
  let labels = 0;
  return (room, nick, text) => {
    const s = socket();
    const params = [room, nick, text];
    const may = state.ready && s !== undefined && allowed("RELAYMSG", params) && state.joined.has(room);
    if (!may || state.relays.size >= RELAYS_MAX) return Promise.resolve(false);
    return new Promise<Relayed>((resolve) => {
      labels += 1;
      const label = `r${String(labels)}`;
      const settle = (took: Relayed): void => {
        clearTimeout(timer);
        state.relays.delete(label);
        resolve(took);
      };
      const timer = setTimeout(settle, ms, "unsure");
      state.relays.set(label, settle);
      try {
        s.write(line("RELAYMSG", params, new Map([["label", label]])));
      } catch {
        settle(false);
      }
    });
  };
}
