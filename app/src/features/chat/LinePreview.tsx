// A page's capture under a line (8f, frames 104 and 107): the line's first link to a realm's home on the default universe's gnoweb, once
// the moderation checked the line (ADR-0002 §6, "Link previews wait for the check"); a DM's lines are never checked, so never one. The
// capture is the previews feature's, drawn through its slot (slots.tsx): its code comes in a chunk of its own, asked by such a line alone.
import type { Block } from "@gnoworld/core";
import type { StreamEvent } from "@gnoworld/schemas";
import { createElement } from "react";
import { site } from "../../places.ts";
import { slot } from "../../slots.tsx";
import { useFocusKept } from "./focusKept.ts";
import { previewIn } from "./pageLinks.ts";

export interface LinePreviewProps {
  blocks: readonly Block[];
  verdict: StreamEvent["state"] | undefined;
  /** Whether it is a Tab stop: on the list's stop alone (U1). */
  tabbable: boolean;
}

export function LinePreview({ blocks, verdict, tabbable }: LinePreviewProps) {
  const path = previewIn(blocks, site.universeAt("/").gnoweb ?? "");
  const drawn = slot("linePreview");
  const shown = path !== undefined && verdict === "checked" && drawn !== undefined;
  // A hide or an edit takes the card away, its open capture with it: the focus they held goes back to the line (F896's class).
  const kept = useFocusKept(!shown);
  return shown ? <div {...kept}>{createElement(drawn, { key: path, path, tabbable })}</div> : null;
}
