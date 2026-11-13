import { ChatLayout } from "../ChatLayout/ChatLayout.tsx";
import { Center, Cluster, Grid, Sidebar, Switcher } from "../compositions/index.ts";
import { Kicker } from "../Kicker/Kicker.tsx";
import { Logo } from "../Logo/Logo.tsx";
import { Panel } from "../Panel/Panel.tsx";
import { Region } from "./Region.tsx";

// Parts of the overview that stand apart: the kickers, the compositions and the chat's frame, drawn with samples.
export function Kickers() {
  return (
    <Cluster space="l">
      <Kicker>On chain · 96 calls a day</Kicker>
      <Kicker dot="warm">Live</Kicker>
      <Kicker dot="mine">Your vote</Kicker>
      <Kicker dot="signal">An uncharted signal</Kicker>
    </Cluster>
  );
}

export function Layout() {
  return (
    <ChatLayout header={<p>Earth · General chat</p>} worlds={<p>Worlds</p>} rooms={<p>Rooms</p>} info={<p>Here now</p>}>
      <p>Lines</p>
    </ChatLayout>
  );
}

/** The regions of the page's frames: the logo, the mark alone and with its wordmark; a panel with a header and a body. */
export function Frames() {
  return (
    <>
      <Region name="Logos">
        <Cluster space="l">
          <Logo />
          <Logo wordmark />
        </Cluster>
      </Region>
      <Region name="Panels">
        <Panel label="Notifications">
          <Panel.Header>
            <h3>Notifications</h3>
          </Panel.Header>
          <Panel.Body>Nothing new</Panel.Body>
        </Panel>
      </Region>
    </>
  );
}

export function Compositions() {
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
