// What the composer keeps beside its draft (moved out of Composer.tsx, which the merge of 4e's refusals and 4f's typing
// grew past the lint's sizes): why Ergo refused the last line, the focus at its start, the selection an edit leaves.
import { COMMANDS, type Composed } from "@gnoworld/core";
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type RefObject } from "react";
import { completions, type Completion } from "./complete.ts";
import type { Edit } from "./format.ts";
import { peopleOf, quoted } from "./names.ts";
import { said, sendable, withHint } from "./said.ts";

/** The lines Ergo refused so far, the last one's draft, and why it did not go. */
export interface Refused {
  count: number;
  draft: string;
  why: string;
}

/** What a refusal leaves in the box `draft` holds: its draft back into an empty box; else the box as typed since,
 * the unsent words quoted after why (CR7). */
export function refusalAfter(draft: string, refused: { draft: string; why: string }): { draft: string; why: string } {
  if (draft === "") return refused;
  return { draft, why: `${refused.why} Unsent: “${quoted(refused.draft)}”` };
}

// Why Ergo refused the last line, said until the draft changes or a line goes: one more refusal while in view puts
// its draft back in an empty box (the store put it back on the device too, where no draft waited).
export function useRefusal(refused: Refused | undefined, draft: string, setDraft: (draft: string) => void) {
  const [why, setWhy] = useState<string>();
  const [answered, setAnswered] = useState(refused?.count);
  if (refused !== undefined && refused.count !== answered) {
    setAnswered(refused.count);
    const after = refusalAfter(draft, refused);
    setDraft(after.draft);
    setWhy(after.why);
  }
  return {
    why,
    said: () => {
      setWhy(undefined);
    },
  };
}

// The box takes the focus as the composer starts, when asked, never again: it is the reader's after.
export function useFocusAtStart(formRef: RefObject<HTMLFormElement | null>, focus: boolean | undefined) {
  const [asked] = useState(focus === true);
  useEffect(() => {
    if (asked) formRef.current?.querySelector("textarea")?.focus();
  }, [asked, formRef]);
}

const boxOf = (form: RefObject<HTMLFormElement | null>) => form.current?.querySelector("textarea") ?? undefined;

/** The form's box, and the selection an edit leaves (`keep`), put back in the box once it shows the new `draft`. */
export function useSelection(formRef: RefObject<HTMLFormElement | null>, draft: string) {
  const selectionRef = useRef<Edit>(undefined);
  useLayoutEffect(() => {
    const selection = selectionRef.current;
    if (selection === undefined) return;
    selectionRef.current = undefined;
    boxOf(formRef)?.focus();
    boxOf(formRef)?.setSelectionRange(selection.start, selection.end);
  }, [draft, formRef]);
  return {
    box: () => boxOf(formRef),
    keep: (edit: Edit) => {
      selectionRef.current = edit;
    },
  };
}

const COARSE = "(pointer: coarse)";

/** Whether the main pointer is a finger (a touch screen), whose keyboard has no Shift: Enter there adds a line (F1714).
 * Read as the screen says it, again when it changes; a page rendered on the server says no. */
function useCoarsePointer(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const media = window.matchMedia(COARSE);
      media.addEventListener("change", onChange);
      return () => {
        media.removeEventListener("change", onChange);
      };
    },
    () => window.matchMedia(COARSE).matches,
    () => false,
  );
}

/** What the field says of the draft, its hint of how to add a line following the screen's pointer; whether that pointer
 * is a finger; and whether the draft may go. `to` names a direct message's partner, whom no typing is told to. */
export function useHelp(
  composed: Composed,
  { nick, label: to, multiline }: { nick: string; label?: string | undefined; multiline?: boolean | undefined },
  { failed, completion, draft }: { failed: boolean; completion?: Completion | undefined; draft: string },
) {
  const coarse = useCoarsePointer();
  const context = { nick, draft, multiline, completion };
  return {
    coarse,
    shown: withHint(said(composed, failed, context), to !== undefined, coarse),
    goes: sendable(composed, multiline),
  };
}

/** What Tab completes the draft's last word to. The room's accounts are sorted out of its members only while a word
 * after `@` is typed: the mention alone, not each key, is what the compiler recomputes them on (F793). */
export function completionOf(
  draft: string,
  { rooms, members, nick }: { rooms: readonly string[]; members: readonly string[]; nick: string },
) {
  const people = /(^|\s)@\S*$/u.test(draft) ? peopleOf(members, nick) : [];
  return completions(draft, { commands: COMMANDS, rooms, people });
}
