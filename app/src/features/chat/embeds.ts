// A link's player (slice 4's 4g; docs/decisions.md, 2026-10-26): an accepted service's own, each from its own
// documentation: YouTube's privacy-enhanced mode (support.google.com/youtube/answer/171780), Vimeo's player with
// Do Not Track (help.vimeo.com, "Player parameters overview"), Giphy's embed_url (developers.giphy.com/docs/api/
// schema). Imgur's form could not be read, its pages refusing crawlers: its links stay links. An id outside its
// alphabet, a host that only looks like one, a port or plain http gets none.
import { inlines, type Block } from "@gnoworld/core";

export interface Embed {
  service: "YouTube" | "Vimeo" | "Giphy";
  /** The player's address, on the service's own host. */
  src: string;
  /** The frame's name, for assistive technology. */
  title: string;
}

const YOUTUBE_ID = /^[\w-]{11}$/;
const YOUTUBE_HOSTS = ["youtube.com", "www.youtube.com", "m.youtube.com", "www.youtube-nocookie.com"];
const VIMEO_HOSTS = ["vimeo.com", "www.vimeo.com"];

// A YouTube video's id, in a watch page's v, youtu.be's path, or a short's or an embed's.
function youtubeId({ hostname, pathname, searchParams }: URL): string | undefined {
  if (hostname === "youtu.be") return pathname.slice(1);
  if (!YOUTUBE_HOSTS.includes(hostname)) return undefined;
  if (pathname === "/watch") return searchParams.get("v") ?? undefined;
  return /^\/(?:shorts|embed)\/([^/]+)$/.exec(pathname)?.[1];
}

// A Vimeo video's id: digits, on its page or its player.
function vimeoId({ hostname, pathname }: URL): string | undefined {
  if (VIMEO_HOSTS.includes(hostname)) return /^\/(\d{1,12})$/.exec(pathname)?.[1];
  return hostname === "player.vimeo.com" ? /^\/video\/(\d{1,12})$/.exec(pathname)?.[1] : undefined;
}

// A Giphy animation's id: its page's last word, its embed's, its media's folder.
function giphyId({ hostname, pathname }: URL): string | undefined {
  if (hostname === "media.giphy.com") return /^\/media\/([A-Za-z\d]+)\/[^/]+$/.exec(pathname)?.[1];
  if (hostname !== "giphy.com") return undefined;
  return /^\/(?:gifs\/(?:[^/]*-)?|embed\/)([A-Za-z\d]+)$/.exec(pathname)?.[1];
}

/** The player a link opens, or none: an accepted service's, over https, on its own host. */
export function embedOf(href: string): Embed | undefined {
  if (!URL.canParse(href)) return undefined;
  const url = new URL(href);
  if (url.protocol !== "https:" || url.port !== "" || url.username !== "" || url.password !== "") return undefined;
  const youtube = youtubeId(url);
  if (youtube !== undefined && YOUTUBE_ID.test(youtube)) {
    // autoplay=1: the frame loads on the reader's Play, which a second click on the service's own button repeated (F1054).
    const src = `https://www.youtube-nocookie.com/embed/${youtube}?autoplay=1`;
    return { service: "YouTube", src, title: "YouTube video" };
  }
  const vimeo = vimeoId(url);
  if (vimeo !== undefined) {
    return { service: "Vimeo", src: `https://player.vimeo.com/video/${vimeo}?dnt=1&autoplay=1`, title: "Vimeo video" };
  }
  const giphy = giphyId(url);
  return giphy === undefined
    ? undefined
    : { service: "Giphy", src: `https://giphy.com/embed/${giphy}`, title: "Giphy animation" };
}

/** The player of a line's first link to an accepted service, or none. */
export function embedIn(blocks: readonly Block[]): Embed | undefined {
  for (const node of inlines(blocks)) {
    if (node.type !== "link") continue;
    const embed = embedOf(node.href);
    if (embed !== undefined) return embed;
  }
  return undefined;
}
