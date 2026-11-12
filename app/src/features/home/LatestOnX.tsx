// The Earth's "Latest on" card (frame 40, the proposal's cardLatest; D13931: gno.land's blog for now, X later): the two last posts of gno.land's
// blog realm, side by side (D13008), read on chain (one vm/qrender of the mainnet, where the posts are: onyx-1's blog is empty), its title, its day and its page on
// gnoweb. A read that fails or finds no post draws no card, never an error. The card is a late chunk: the first screen holds none of it.
import { Card, Grid } from "@gnoworld/ui";
import { queryOptions, useQuery } from "@tanstack/react-query";
import universes from "../../../data/universes.json" with { type: "json" };
import { BLOG_REALM, latestPosts } from "../../lib/chain/blog.ts";
import { utcDay } from "../../lib/days.ts";
import { OutLinks } from "../../OutLinks.tsx";
import styles from "./LatestOnX.module.css";
import { gnowebLink } from "../../lib/chain/gnoweb.ts";
import { readPage } from "../../lib/chain/rpc.ts";
import { queryClient, Unread } from "../../lib/query/client.ts";
import { keys } from "../../lib/query/keys.ts";
import { pageFetch } from "../../lib/query/policy.ts";

// The posts are on the mainnet alone, whatever universe the page is in.
const chain = universes.find((universe) => !universe.testnet);

const blogOptions = (rpc: string) =>
  queryOptions({
    queryKey: keys.blog(rpc),
    queryFn: async ({ signal }) => {
      const read = await readPage(rpc, { realm: BLOG_REALM }, { fetch: pageFetch, signal });
      const posts = read.ok ? latestPosts(read.value, 2) : [];
      if (posts.length === 0) throw new Unread(undefined);
      return posts;
    },
  });

// The blog posts are dated in UTC on chain: the day stays UTC.
const dayOf = (date: string) => utcDay(new Date(date), new Date());

export function LatestOnX() {
  const rpc = chain?.rpc ?? "";
  const { data: posts } = useQuery({ ...blogOptions(rpc), enabled: chain !== undefined }, queryClient);
  const link = chain === undefined || posts === undefined ? undefined : gnowebLink(chain.gnoweb, BLOG_REALM);
  if (posts === undefined || link === undefined) return null;
  return (
    <Card look="hub" rises>
      <Card.Header icon="news" title="Latest on gno.land" level={2} />
      <Card.Body>
        <Grid min="s">
          {posts.map((post) => (
            <div className={styles["post"]} key={post.slug}>
              <time className="meta" dateTime={post.date}>
                {dayOf(post.date)}
              </time>
              <b>{post.title}</b>
              <OutLinks links={[{ label: "Read on gno.land", href: `${link}:p/${post.slug}` }]} />
            </div>
          ))}
        </Grid>
      </Card.Body>
    </Card>
  );
}
