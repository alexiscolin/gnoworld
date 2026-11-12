// The composer's Ask Jarvis, beside its quick actions' /: a click starts the draft with `@jarvis `, and a line that starts so goes to Jarvis (jarvisLine.ts).
// Where Jarvis cannot answer the account (jarvisHere.ts) it is greyed with its reason; a direct message, with no quick actions, has none.
import { Button } from "@gnoworld/ui";
import type { ReactNode } from "react";
import { jarvisExamples } from "@gnoworld/schemas";
import { askJarvis, useJarvisHere, useJarvisOn } from "../../jarvisHere.ts";
import { JARVIS_MENTION, jarvisQuestion } from "./jarvisLine.ts";
import styles from "./JarvisButton.module.css";

/** What the composer does for Jarvis, where Jarvis can answer an account from the chat in view and the box has quick actions (a
 * thread's has none): whether it can, the quick actions with the button beside them, and the sending of a line to Jarvis. */
export function useJarvis(quick: ReactNode) {
  const here = useJarvisHere();
  const answers = here?.account !== undefined && quick !== undefined;
  const on = useJarvisOn();
  return {
    answers,
    /** The questions offered after `@jarvis `, the place's first. */
    examples: here !== undefined && answers ? jarvisExamples(here.room, here.realm) : undefined,
    /** The quick actions with the button beside them; `onMention` takes what the button puts at the draft's start. */
    quickWith: (onMention: (mention: string) => void): ReactNode =>
      quick === undefined ? undefined : (
        <>
          {quick}
          <JarvisButton
            onMention={onMention}
            off={answers ? undefined : on ? "Jarvis cannot be asked here" : "Jarvis is off for now"}
          />
        </>
      ),
    /** Asks Jarvis the question of a line that starts with `@jarvis `; whether it did, so the line goes not to the room. */
    asked: (draft: string): boolean => {
      const question = answers ? jarvisQuestion(draft) : undefined;
      if (question === undefined) return false;
      askJarvis(question);
      return true;
    },
  };
}

// Its spark and its name, "Jarvis", read as "Ask Jarvis". Where Jarvis cannot answer the button stays, disabled and greyed, and says why in its name.
function JarvisButton({ onMention, off }: { onMention: (mention: string) => void; off: string | undefined }) {
  return (
    <span className={styles["jarvis"]} data-off={off === undefined ? undefined : ""}>
      <Button
        icon="spark"
        size="s"
        emphasis="quiet"
        disabled={off !== undefined}
        onClick={() => {
          onMention(JARVIS_MENTION);
        }}
      >
        <span className="visually-hidden">Ask </span>Jarvis
        {off === undefined ? null : <span className="visually-hidden">: {off}</span>}
      </Button>
    </span>
  );
}
