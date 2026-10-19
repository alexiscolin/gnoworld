import type { ReactNode } from "react";
import { Button } from "../Button/Button.tsx";
import { IconButton } from "../Button/IconButton.tsx";
import { Center, Cluster, Grid, Sidebar, Stack, Switcher } from "../compositions/index.ts";
import { Icon, ICON_NAMES } from "../icons/Icon.tsx";
import { Kicker } from "../Kicker/Kicker.tsx";

function Region({ name, children }: { name: string; children: ReactNode }) {
  return (
    <section aria-label={name}>
      <Stack>
        <h2>{name}</h2>
        {children}
      </Stack>
    </section>
  );
}

function Buttons() {
  return (
    <Stack>
      <Cluster>
        <Button emphasis="solid">Read the proposals</Button>
        <Button>Join the chat</Button>
        <Button emphasis="quiet">Read it · free</Button>
        <Button icon="planet">Fly to Earth</Button>
      </Cluster>
      <Cluster>
        <Button emphasis="solid" tone="danger">
          Delete the room
        </Button>
        <Button tone="danger">Leave the room</Button>
        <Button disabled>Register</Button>
        <Button busy>Waiting for Adena</Button>
      </Cluster>
    </Stack>
  );
}

function IconButtons() {
  return (
    <Cluster>
      <IconButton icon="search" label="Search" />
      <IconButton icon="bell" label="Notifications, 8 unread" count={8} />
      <IconButton icon="star" label="Save the room" pressed />
      <IconButton icon="bold" label="Bold" emphasis="plain" size="s" />
      <IconButton icon="close" label="Close" size="l" />
    </Cluster>
  );
}

function Compositions() {
  return (
    <Sidebar space="m">
      <Kicker vertical>Hub atlas</Kicker>
      <Switcher>
        <Center max="measure">
          <p>Stack, Cluster, Grid, Sidebar, Switcher and Center do all the layout.</p>
        </Center>
        <Grid min="s">
          <Kicker dot="warm">Live</Kicker>
          <Kicker dot="signal">An uncharted signal</Kicker>
        </Grid>
      </Switcher>
    </Sidebar>
  );
}

/** Every component at once (docs/DESIGN-SYSTEM.md, "Storybook shows everything"). */
export function Overview() {
  return (
    <Stack space="xl">
      <Region name="Buttons">
        <Buttons />
      </Region>
      <Region name="Icon buttons">
        <IconButtons />
      </Region>
      <Region name="Kickers">
        <Cluster space="l">
          <Kicker>On chain · 96 calls a day</Kicker>
          <Kicker dot="warm">Live</Kicker>
          <Kicker dot="mine">Your vote</Kicker>
          <Kicker dot="signal">An uncharted signal</Kicker>
        </Cluster>
      </Region>
      <Region name="Icons">
        <Grid as="ul" min="s" space="xs">
          {ICON_NAMES.map((name) => (
            <li key={name}>
              <Cluster space="2xs">
                <Icon name={name} />
                <code>{name}</code>
              </Cluster>
            </li>
          ))}
        </Grid>
      </Region>
      <Region name="Compositions">
        <Compositions />
      </Region>
    </Stack>
  );
}
