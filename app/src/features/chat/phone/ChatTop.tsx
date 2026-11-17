// The chat's header: a phone's (the place band, its rooms' row and the Info sheet; its code asked once the window is a phone's, so a computer's
// chat never carries it) or the wide chat's and the dock's.
import type { ComponentProps, RefObject } from "react";
import { ErrorView, errorKind } from "../../errors/index.ts";
import { ChatHeader, type ChatHeaderProps } from "../ChatHeader.tsx";
import { chunked } from "../Failing.tsx";
import styles from "../ChatScreen.module.css";

const PhoneTop = chunked(async () => ({ default: (await import("./phoneChat.tsx")).PhoneTop }), {
  waiting: <span className={styles["topWaiting"]} />,
  failed: (error) => <ErrorView kind={errorKind(error)} size="inline" urgent />,
});

type Phone = ComponentProps<typeof PhoneTop>;

export function ChatTop({
  place,
  phone,
  screen,
  search,
  chips,
  talking,
  room,
  people,
  present,
  ...header
}: ChatHeaderProps &
  Pick<Phone["header"], "search" | "chips"> &
  Phone["info"] & { present?: number | undefined; phone: boolean; screen: RefObject<HTMLElement | null> }) {
  if (!phone) return <ChatHeader world={place.name} {...header} />;
  const { title, mark, rooms } = header;
  return (
    <PhoneTop
      header={{ title, mark, rooms, chips, search }}
      info={{ place, talking, room, people }}
      present={present}
      screen={screen}
    />
  );
}
