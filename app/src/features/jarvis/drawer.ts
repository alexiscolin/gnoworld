// The chat's drawing as the cards use it: core's tree through Message.tsx's elements, an answer's links drawn by the card.
import { markdown } from "@gnoworld/core";
import type { Drawing } from "../chat/index.ts";
import type { DrawMarkdown } from "./AnswerCard.tsx";

export const drawerOf =
  ({ reader, block }: Drawing): DrawMarkdown =>
  (text, link) =>
    markdown(text).map((node) => block(node, { ...reader, link }));
