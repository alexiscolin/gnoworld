// A world's connected worlds (frames 26, 93, 104): "CONNECTED WORLDS", one row each, its picture, its name and a line in the label's
// capitals, a link to its page with the frame's arrow after it. Nothing is drawn, not even the heading, with none. The pin of the frame is
// left out: nothing to pin a world to yet.
import { Icon, Kicker, PlanetThumb, Row, Stack } from "@gnoworld/ui";

export interface ConnectedWorld {
  name: string;
  path: string;
  line: string;
}

export function Connected({ worlds }: { worlds: readonly ConnectedWorld[] }) {
  if (worlds.length === 0) return null;
  return (
    <Stack space="2xs">
      <Kicker dot="world">Connected worlds</Kicker>
      <div>
        {worlds.map(({ name, path, line }) => (
          <Row
            key={path}
            look="divided"
            title={name}
            subtitle={line}
            subtitleLook="label"
            href={path}
            lead={<PlanetThumb src="" name={name} decorative />}
            trail={<Icon name="arrow" />}
          />
        ))}
      </div>
    </Stack>
  );
}
