// The room's Media (the video's frame 56, over Saved; frame 104's image icon in the dock): what its lines shared from the accepted
// services, a link each, newest first. Images come by link only (uploads are cut); the list reads the room's lines this page holds.
// The list's code comes when it is first asked for.
import type { Line } from "@gnoworld/core";
import { Icon, NavItem } from "@gnoworld/ui";
import { lazy, Suspense, useState } from "react";
import { useLocation } from "react-router";

const MediaView = lazy(async () => ({ default: (await import("./MediaView.tsx")).MediaView }));

export function Media({ room, lines }: { room: string | undefined; lines: readonly Line[] }) {
  // Open at an address: a move to another room closes it, as the room behind it changes.
  const { key } = useLocation();
  const [opened, setOpened] = useState<string>();
  const [asked, setAsked] = useState(false);
  if (room === undefined) return null;
  return (
    <>
      <NavItem
        lead={<Icon name="image" />}
        onClick={() => {
          setAsked(true);
          setOpened(key);
        }}
      >
        Media
      </NavItem>
      {asked ? (
        <Suspense fallback={null}>
          <MediaView
            room={room}
            lines={lines}
            open={opened === key}
            onClose={() => {
              setOpened(undefined);
            }}
          />
        </Suspense>
      ) : null}
    </>
  );
}
