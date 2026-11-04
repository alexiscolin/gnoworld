// A site of two universes as the tests plant it: the real data holds one world and no ecosystem, so no page of an
// ecosystem or of another universe's world is seen on it.
const row = (slug: string, universe: string, name = slug.toUpperCase()) => ({
  slug,
  name,
  description: `${name}, a place of the fixture, described at more than fifty characters, as the schema asks.`,
  universe,
});

export const FIXTURE = {
  universes: [
    { id: "onyx", name: "Onyx", default: true as const },
    { id: "gnoland", name: "gno.land" },
  ],
  hubs: [row("bubble", "onyx", "Bubble"), row("other", "gnoland", "Other"), row("tokens", "onyx", "Token station")],
  ecosystems: [row("tokens", "onyx", "Tokens"), row("tokens", "gnoland", "Tokens of gno.land")],
  genres: [
    { slug: "game", name: "Game" },
    { slug: "tool", name: "Tool" },
  ],
};

// A second planted site, for the pages that show a count or a label of the universe: two worlds in its default universe,
// which is no testnet, and one in a universe that is not the default and is a testnet.
const planted = (slug: string, universe: string, name: string) => ({
  slug,
  name,
  description: `${name}, a place of the planted site, described at more than fifty characters, as the schema asks.`,
  universe,
});

export const PLANTED = {
  universes: [
    { id: "main", name: "Mainland", default: true as const },
    { id: "lab", name: "Lab", testnet: true as const },
  ],
  hubs: [planted("alpha", "main", "Alpha"), planted("beta", "main", "Beta"), planted("gamma", "lab", "Gamma")],
  ecosystems: [],
  genres: [],
};
