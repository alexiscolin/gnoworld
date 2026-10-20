import { Button } from "../Button/Button.tsx";
import { IconButton } from "../Button/IconButton.tsx";
import { Center, Cluster, Grid, Sidebar, Stack, Switcher } from "../compositions/index.ts";
import { Icon, ICON_NAMES } from "../icons/Icon.tsx";
import { Kicker } from "../Kicker/Kicker.tsx";
import { Region } from "./Region.tsx";

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
      <IconButton icon="bell" label="Unread notifications" count={8} />
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

// The elements the base layer styles, and the label in a script whose caps it leaves alone.
function Text() {
  return (
    <Stack>
      <h1>The system at a glance</h1>
      <h2>Panel and dialog titles</h2>
      <h3>Notifications</h3>
      <p>
        Proposal 15 lives at <code>gno.land/r/gov/dao</code>; <a href="#text">read it</a> before you vote.
      </p>
      <small>2 min ago · translated from Portuguese</small>
      <hr />
      <p className="label">On chain · 96 calls a day</p>
      <p className="label" lang="ar">
        على السلسلة
      </p>
    </Stack>
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
      <Region name="Text">
        <Text />
      </Region>
      <Region name="Compositions">
        <Compositions />
      </Region>
    </Stack>
  );
}
