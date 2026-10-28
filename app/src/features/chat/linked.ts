// Whether a line holds a link a player can be shown for (embeds.ts): the asker's question of each line, answered from its
// Markdown, so its code is asked with a room's first lines, never with the first screen (ADR-0001 §12; useVerdicts.ts).
import { markdown } from "@gnoworld/core";
import { embedIn } from "./embeds.ts";

export const linked = (text: string): boolean => embedIn(markdown(text)) !== undefined;
