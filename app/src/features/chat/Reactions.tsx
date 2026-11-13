// A line's reactions under it (slice 4's 4d): each emoji as the design system's chip with its count, which an account
// presses to join, its own pressed to take back; a guest reads them. Out of the list's live announcements; 20 distinct
// emoji a line at most, the rest said in a word (docs/decisions.md, 2026-10-26).
import type { Reacting, Shown } from "@gnoworld/core";
import { Chip, Cluster } from "@gnoworld/ui";
import { useRef } from "react";

/** The emoji a line shows at most: its Tab stops bounded (R3). */
const CHIPS_SHOWN = 20;

export interface ReactionsProps {
  /** The line's msgid. */
  to: string;
  /** What the line shows, as chipsOf writes it. */
  chips: string;
  /** Reacts, or takes the reaction back; none for a guest, who reads them. */
  react: ((reaction: Reacting) => boolean) | undefined;
}

// A chip's name: its emoji, its count, and whether the reader is one of them (docs/DESIGN-SYSTEM.md).
const nameOf = ({ emoji, count, mine }: Shown): string => `${emoji}, ${String(count)}${mine ? ", including you" : ""}`;

/** A line's chips as one string, which React compares by value: a line keeps its chips while the room's others change
 * (F1222). A chip is its count, a star when it is mine or a space, and its emoji, one a line. */
export const chipsOf = (shown: readonly Shown[]): string =>
  shown.map(({ emoji, count, mine }) => `${String(count)}${mine ? "*" : " "}${emoji}`).join("\n");

// The chips chipsOf wrote: the count's digits first, then the star or the space, then the emoji.
function shownOf(chips: string): Shown[] {
  if (chips === "") return [];
  return chips.split("\n").map((chip) => {
    const count = Number.parseInt(chip, 10);
    const at = String(count).length;
    return { emoji: chip.slice(at + 1), count, mine: chip.charAt(at) === "*" };
  });
}

export function Reactions({ to, chips, react }: ReactionsProps) {
  const shown = shownOf(chips);
  const more = shown.length - CHIPS_SHOWN;
  const boxRef = useRef<HTMLDivElement>(null);
  return (
    <div ref={boxRef} role="group" aria-label="Reactions" aria-live="off">
      <Cluster space="3xs">
        {shown.slice(0, CHIPS_SHOWN).map((each) =>
          react === undefined ? (
            <Chip key={each.emoji}>{`${each.emoji} ${String(each.count)}`}</Chip>
          ) : (
            <Chip
              key={each.emoji}
              size="xs"
              label={nameOf(each)}
              count={each.count}
              selected={each.mine}
              onClick={() => {
                react({ to, emoji: each.emoji, on: !each.mine });
                // The last of an emoji taken back: its chip goes with Ergo's echo, the focus to its line (CR4).
                if (each.mine && each.count === 1) boxRef.current?.closest("li")?.focus();
              }}
            >
              {each.emoji}
            </Chip>
          ),
        )}
        {more > 0 ? <span>{`+${String(more)} more`}</span> : null}
      </Cluster>
    </div>
  );
}
