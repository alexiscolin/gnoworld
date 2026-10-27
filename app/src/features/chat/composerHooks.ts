// What the composer keeps beside its draft (moved out of Composer.tsx, which the merge of 4e's refusals and 4f's typing
// grew past the lint's sizes): why Ergo refused the last line, the focus at its start, the selection an edit leaves.
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import type { RefusedTags } from "../../store/dms.ts";
import type { Edit } from "./format.ts";

/** The lines Ergo refused so far, the last one's draft, and why it did not go. */
export interface Refused {
  count: number;
  draft: string;
  why: string;
  /** The reply's or the correction's tags the line went with, when its draft is back on the device (CR2). */
  tags?: RefusedTags;
}

/** What a refusal leaves in the box `draft` holds: its draft back into an empty box, or into a box that holds it already
 * (a correction taken up again); else the box as typed since, the unsent words quoted whole after why (CR7, CR2). */
export function refusalAfter(draft: string, refused: { draft: string; why: string }): { draft: string; why: string } {
  if (draft === "" || draft === refused.draft) return refused;
  return { draft, why: `${refused.why} Unsent: “${refused.draft}”` };
}

// Why Ergo refused the last line, said until the draft changes or a line goes: one more refusal while in view puts
// its draft back in an empty box (the store put it back on the device too, where no draft waited). A composer starts
// telling a refusal not told yet (`fresh`: a correction taken up again), or that its edit's line went (`gone`, CR3).
export function useRefusal(
  refused: Refused | undefined,
  draft: string,
  {
    setDraft,
    fresh = false,
    gone = false,
  }: { setDraft: (draft: string) => void; fresh?: boolean | undefined; gone?: boolean | undefined },
) {
  const [why, setWhy] = useState<string | undefined>(gone ? "That message is gone." : undefined);
  const [answered, setAnswered] = useState(fresh ? undefined : refused?.count);
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
    if (asked) formRef.current?.querySelector("input")?.focus();
  }, [asked, formRef]);
}

const boxOf = (form: RefObject<HTMLFormElement | null>) => form.current?.querySelector("input") ?? undefined;

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
