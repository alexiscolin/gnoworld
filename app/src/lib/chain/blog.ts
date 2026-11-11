// gno.land's blog as the Earth's "Latest on X" card reads it (D13931): the realm's page (vm/qrender, one read through rpc.ts's readPage)
// holds one `### [title](/r/gnoland/blog:p/slug)` line and its day ("30 Oct 2026") a post, newest first; the newest is picked here, each
// through the schema (hidden characters, slug, day), and a post that fails it is skipped, never half shown.
import { BlogPost } from "@gnoworld/schemas";
import type { output } from "zod/mini";

/** The blog realm: gno.land's mainnet alone holds posts (onyx-1's says "No posts."), so the card reads that chain, not the default universe's. */
export const BLOG_REALM = "gno.land/r/gnoland/blog";

export type Post = output<typeof BlogPost>;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const POST = /^### \[([^\]\n]+)\]\(\/r\/gnoland\/blog:p\/([^)\s]+)\)\n(\d{1,2}) ([A-Z][a-z]{2}) (\d{4})$/gm;

/** The newest post of the blog's page, or nothing when none is there or none passes the schema. */
export function latestPost(page: string): Post | undefined {
  let newest: Post | undefined;
  for (const [, title, slug, day = "", month = "", year = ""] of page.matchAll(POST)) {
    const at = MONTHS.indexOf(month) + 1;
    const post = BlogPost.safeParse({
      title,
      slug,
      date: `${year}-${String(at).padStart(2, "0")}-${day.padStart(2, "0")}`,
    });
    if (post.success && (newest === undefined || post.data.date > newest.date)) newest = post.data;
  }
  return newest;
}
