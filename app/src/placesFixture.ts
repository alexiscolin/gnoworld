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
  hubs: [row("bubble", "onyx", "Bubble"), row("other", "gnoland", "Other")],
  ecosystems: [row("tokens", "onyx", "Tokens"), row("tokens", "gnoland", "Tokens of gno.land")],
  stations: [row("tokens", "onyx", "Token station")],
  genres: [
    { slug: "game", name: "Game" },
    { slug: "tool", name: "Tool" },
  ],
};
