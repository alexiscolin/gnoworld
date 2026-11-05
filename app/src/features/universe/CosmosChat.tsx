// The Earth's general chat docked over the cosmos (frame 143): the dock at the right where the rail stands, the flight panel and the labels
// beside it, the scene running under; under the dock's width the chat takes the page, as on the Earth's. A chunk of its own, asked when the
// header's Chat first opens it: the first screen holds the button alone.
import { Panel } from "@gnoworld/ui";
import { setCosmosChat } from "../../cosmosChat.ts";
import type { UniverseView } from "../../places.ts";
import { Chat, chatPlace, EARTH_CHAT, EARTH_KICKER } from "../chat/index.ts";

const shut = () => {
  setCosmosChat(false);
};

export default function CosmosChat({ universe }: { universe: UniverseView }) {
  // Its close shuts the dock and leaves the reader on the cosmos; no block of the page holds it there, so a narrow window gives it the page.
  const place = { ...chatPlace(EARTH_CHAT, universe, EARTH_KICKER), inPage: false, close: shut };
  return (
    <Panel.Dock alone>
      <Chat world={EARTH_CHAT.slug} place={place} />
    </Panel.Dock>
  );
}
