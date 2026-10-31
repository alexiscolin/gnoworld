// A world's connected worlds (frame 26): one row each, its picture, its name and a line, a link to its page. Nothing is
// drawn, not even the heading, with none. The arrow and the pin of the frame are left out: neither works yet.
import { Kicker, PlanetThumb, Row, Stack } from "@gnoworld/ui";

export interface ConnectedWorld {
  name: string;
  path: string;
  line: string;
}

/** `heading` is the kicker over the rows: "Connected worlds" on a world's page, the list's own name (the Earth's "Worlds") elsewhere. */
export function Connected({
  worlds,
  heading = "Connected worlds",
}: {
  worlds: readonly ConnectedWorld[];
  heading?: string;
}) {
  if (worlds.length === 0) return null;
  return (
    <Stack space="2xs">
      <Kicker>{heading}</Kicker>
      <div>
        {worlds.map(({ name, path, line }) => (
          <Row
            key={path}
            look="divided"
            title={name}
            subtitle={line}
            href={path}
            lead={<PlanetThumb src="" name={name} decorative />}
          />
        ))}
      </div>
    </Stack>
  );
}
