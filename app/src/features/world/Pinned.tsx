// A world's pinned actions (D271), each shown once vm/qfuncs confirms it on the chain its realm view names; code asked only by a world
// that pins one, after hydration. On the plate, under Read the proposals (Proposals.tsx): a Form block each, under its label. In the
// chat's quick actions bar, which the route hands these: a pill each after Who's here, and the cards they open, drawn over the bar; a
// card's id holds the bar's, the call and its view, so a card opened in one world never shows under another's pill.
import type { ReadOptions } from "@gnoworld/chain/read";
import { pinnedOf, type PinnedCall, type PinnedRow } from "../../pinned.ts";
import { realmAt } from "../../realmAt.ts";
import { ActionForm, InlineCard } from "../realms/index.ts";
import styles from "./Pinned.module.css";

// The realm and chain an action is read and signed on: its view's, when that view is its own realm's.
function placed(call: PinnedCall) {
  const found = realmAt(call.view);
  return found?.realm === call.action.realm ? found : undefined;
}

const keyOf = (index: number, call: PinnedCall) => `${String(index)} ${call.view} ${JSON.stringify(call.action)}`;

/** The plate's: each a block of the plate's own stack, so one the chain does not confirm draws nothing, not even a gap. */
export interface PinnedFormsProps {
  pinned: readonly PinnedCall[];
  options?: ReadOptions | undefined;
}

export function PinnedForms({ pinned, options }: PinnedFormsProps) {
  return (
    <div className={styles["forms"]}>
      {pinned.map((call, index) => {
        const found = placed(call);
        return found === undefined ? null : (
          <ActionForm
            key={keyOf(index, call)}
            action={call.action}
            label={call.label}
            chain={found.chain}
            options={options}
          />
        );
      })}
    </div>
  );
}

/** What the chat's bar draws of a world's pinned actions: its pills, or the cards they open; a card's id holds the bar's (`at`). */
export interface PinnedBarProps {
  part: "pills" | "cards";
  actions: readonly PinnedRow[];
  universe: { id: string; isDefault: boolean };
  at: string;
}

export function PinnedBar({ part, actions, universe, at }: PinnedBarProps) {
  return pinnedOf(actions, universe).map((call, index) => {
    const found = placed(call);
    const card = `${at} ${keyOf(index, call)}`;
    if (found === undefined) return null;
    return part === "cards" ? (
      <InlineCard key={card} id={card} place={{ realm: found.realm, chain: found.chain }} title={call.label} />
    ) : (
      <ActionForm
        key={card}
        action={call.action}
        label={call.label}
        chain={found.chain}
        viewHref={call.view}
        bar={{ card }}
      />
    );
  });
}
