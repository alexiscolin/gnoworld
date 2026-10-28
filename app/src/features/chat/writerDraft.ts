// What a room's composer starts from and keeps, moved out of Writer.tsx for the lint's sizes.
import type { Address } from "@gnoworld/schemas";
import { pageDrafts } from "../../lib/drafts/page.ts";
import type { WriterProps } from "./Writer.tsx";

// What the composer starts from and keeps: the account's drafts on this device, the room's (4d), or a thread's own, which
// the page keeps in memory; a correction's own words (an edit) are kept nowhere, as a refused correction taken up again
// (`back`) is a plain draft.
export function draftOf(props: WriterProps, address: Address) {
  const { room, keeps = true, draft, onDraft, editing } = props;
  const kept = pageDrafts(address);
  const plain = editing === undefined || editing.back === true;
  const device = keeps
    ? {
        draft: kept.get(room),
        onDraft: (text: string) => {
          kept.set(room, text);
        },
      }
    : { draft, onDraft };
  return {
    draft: plain ? device.draft : editing.text,
    onDraft: plain ? device.onDraft : undefined,
    fresh: editing?.back,
    key: editing === undefined ? room : `${room} edit ${String(editing.asked)}`,
  };
}
