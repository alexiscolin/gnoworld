// What the unit tests of GovDAO's plate share: its realm's home page as RECORDED on onyx-1 (tests/chain/recorded, its first line the
// recording's own comment), the realm's view, and GovDAO's pinned Vote as hubs.json holds it (D271).
export const HOME = Object.values(
  import.meta.glob<string>("./chain/recorded/onyx-1-gov-dao-home.md", {
    query: "?raw",
    import: "default",
    eager: true,
  }),
)
  .join("")
  .replace(/^<!--.*-->\n/, "");

export const PATH = "/r/gov/dao";

/** GovDAO's pinned Vote, and the universe it is in. */
export const PINNED_VOTE = {
  actions: [{ label: "Vote", realm: "gno.land/r/gov/dao", function: "MustVoteOnProposalSimple", args: {} }],
  universe: { id: "onyx", isDefault: true },
};
