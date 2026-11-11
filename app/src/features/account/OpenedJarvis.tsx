// The account menu with its Jarvis item alive once Jarvis is on and the chat in view has a room it can read (10u-a); in the menu's own
// chunk, so the first screen carries none of it.
import type { ComponentProps } from "react";
import { useJarvisHere } from "../../jarvisHere.ts";
import { askFor } from "../../pageAsks.ts";
import { Opened } from "./Opened.tsx";

export function OpenedJarvis(props: ComponentProps<typeof Opened>) {
  // Told only while Jarvis is on and the chat in view is a room: that is the whole condition.
  const here = useJarvisHere();
  return (
    <Opened
      {...props}
      {...(here === undefined
        ? {}
        : {
            onJarvis: () => {
              askFor("jarvis");
            },
          })}
    />
  );
}
