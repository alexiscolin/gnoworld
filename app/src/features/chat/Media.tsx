// The room's Media (the video's frame 56, over Saved; frame 104's image icon in the dock): greyed "coming soon", what
// its lines shared from the accepted services; images come by link only, never uploaded.
import { Icon, NavItem } from "@gnoworld/ui";

export function Media({ room }: { room: string | undefined }) {
  if (room === undefined) return null;
  return (
    <NavItem lead={<Icon name="image" />} soon>
      Media
    </NavItem>
  );
}
