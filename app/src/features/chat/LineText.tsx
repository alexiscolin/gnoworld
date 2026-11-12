import type { Block } from "@gnoworld/core";
import { Markdown } from "./Message.tsx";
import rules from "./markdownRules.module.css";
import styles from "./RoomView.module.css";

// A line's text drawn, its mentions of `known` (space-separated) shortened. A component of its own, with a string the
// compiler compares by value: the line keeps its drawing while others join and leave (F812's cost).
// Its links are Tab stops on the list's stop alone (U1).
export interface LineTextProps {
  blocks: readonly Block[];
  me: string | undefined;
  known: string;
  stop: boolean;
}

export function LineText({ blocks, me, known, stop }: LineTextProps) {
  return (
    <Markdown
      blocks={blocks}
      className={[styles["text"], rules["rules"]].join(" ")}
      me={me}
      members={new Set(known.split(" "))}
      tabbable={stop}
    />
  );
}
