// A realm's next stops (D375): the other realms of its system, from the worlds' file, as rows that link to their pages. Nothing is drawn,
// not even the heading, with none, or before the file has come; Discover's own stops (D373) join them when it has some.
import { REALM_PREFIX, realmName, worldIdOf } from "@gnoworld/core";
import type { Worlds } from "@gnoworld/schemas/indexer";
import { Icon, Kicker, Row, Stack } from "@gnoworld/ui";

const SHOWN = 5;

export interface NextStopsProps {
  realm: string;
  /** The worlds' file, once it has come. */
  worlds: Worlds["worlds"] | undefined;
  /** The universe's own prefix, "" for the default one ("/net/<id>" otherwise). */
  prefix: string;
}

export default function NextStops({ realm, worlds, prefix }: NextStopsProps) {
  const system = worlds?.find(({ id }) => id === worldIdOf(realm));
  const stops = (system?.realms ?? []).filter(({ path }) => path !== realm).slice(0, SHOWN);
  if (stops.length === 0) return null;
  return (
    <Stack space="xs">
      <Kicker dot="world">Next stops</Kicker>
      <div>
        {stops.map(({ path }) => (
          <Row
            key={path}
            look="divided"
            title={realmName(path).name}
            subtitle={`@${realmName(path).namespace}`}
            subtitleLook="label"
            href={`${prefix}/r/${path.slice(REALM_PREFIX.length)}`}
            trail={<Icon name="arrow" />}
          />
        ))}
      </div>
    </Stack>
  );
}
