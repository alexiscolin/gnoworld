// A public answer of Jarvis among a room's lines: the full answer kept for the line and its asker, read once a page by its room and id, drawn as
// Jarvis's card; the plain line stays while it is read and when there is none to draw. A refused read is no answer: drawn again, the line reads again.
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { Result } from "../../lib/api/http.ts";
import type { KeptAnswer } from "../../lib/api/jarvis.ts";
import { queryClient, Unread } from "../../lib/query/client.ts";
import { keys } from "../../lib/query/keys.ts";
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
  const { data } = useQuery(
    {
      queryKey: keys.jarvisSaid(room, msgid),
      queryFn: async () => {
        const result = await read(room, msgid);
        if (!result.ok) throw new Unread(result);
        return result.value;
      },
      staleTime: Infinity,
      retry: false,
    },
    queryClient,
  );
  return data?.answer.status === "answered" ? (
    <AnswerCard answer={data.answer} asker={data.asker} {...card} />
  ) : (
    fallback
  );
}
