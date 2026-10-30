import { ChatLayout } from "../ChatLayout/ChatLayout.tsx";
import { Cluster } from "../compositions/index.ts";
import { Kicker } from "../Kicker/Kicker.tsx";

// Two parts of the overview that stand apart: the kickers and the chat's frame, drawn with samples.
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
