// A public answer of Jarvis among a room's lines: the full answer kept for the line and its asker, read once by its room and id, drawn as Jarvis's card;
// the plain line stays while it is read and when there is none to draw.
import { useEffect, useState, type ReactNode } from "react";
import type { Result } from "../../lib/api/http.ts";
import type { KeptAnswer } from "../../lib/api/jarvis.ts";
import { AnswerCard, type AnswerCardProps } from "./AnswerCard.tsx";

export interface JarvisSaidProps {
  room: string;
  msgid: string;
  read: (room: string, msgid: string) => Promise<Result<KeptAnswer>>;
  card: Omit<AnswerCardProps, "answer" | "asker">;
  /** What stands while the answer is read, and when it cannot be drawn. */
  fallback?: ReactNode;
}

export function JarvisSaid({ room, msgid, read, card, fallback = null }: JarvisSaidProps): ReactNode {
  const [kept, setKept] = useState<{ answer: AnswerCardProps["answer"]; asker: string }>();
  useEffect(() => {
    let current = true;
    read(room, msgid)
      .then((result) => {
        if (current && result.ok && result.value.answer.status === "answered")
          setKept({ answer: result.value.answer, asker: result.value.asker });
      })
      .catch(reportError);
    return () => {
      current = false;
    };
  }, [room, msgid, read]);
  return kept === undefined ? fallback : <AnswerCard {...kept} {...card} />;
}
