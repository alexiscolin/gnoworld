// Whether a line holds a link the server may have something for (embeds.ts's player, or a link card's first https page): the asker's question
// of each line, answered from its Markdown, so its code is asked with a room's first lines, never with the first screen (ADR-0001 §12;
// useVerdicts.ts).
import { cardLinkOf, markdown } from "@gnoworld/core";
import { embedIn } from "./embeds.ts";

export const linked = (text: string): boolean =>
  embedIn(markdown(text)) !== undefined || cardLinkOf(text) !== undefined;
