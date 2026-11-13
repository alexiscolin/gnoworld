// A link's card under a chat line (link-previews L4): the page's host, site, title, description and picture, as the server checked them, the
// card linking to the line's own URL. Its text is React's text, never read as markup; its picture is the one route of its key, not for a
// reader who saves data. Its author and the room's moderators can remove it. A chunk of its own, asked by a line that has a card.
import { Button, Card, Cluster } from "@gnoworld/ui";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { pageCardsApi, pictureOf } from "../../lib/api/cards.ts";
import { queryClient, Unread } from "../../lib/query/client.ts";
import { keys } from "../../lib/query/keys.ts";
import { useAppStore } from "../../storeContext.tsx";
import { addCards } from "./cardsSlice.ts";
import styles from "./LinkCard.module.css";
import { LINK } from "./Message.tsx";

export interface LinkCardProps {
  /** The card's key, the line's room and its id (the removal's), and the line's own URL. */
  cardKey: string;
  room: string;
  msgid: string;
  href: string;
  saving: boolean;
  removable: boolean;
  /** Whether its link is a Tab stop: on the list's stop alone (U1). */
  tabbable: boolean;
}

// A card's content by its key: one request for every line that links the same page; one that did not come whole is never kept.
const cardOptions = (key: string) =>
  queryOptions({
    queryKey: keys.card(key),
    queryFn: async () => {
      const got = await pageCardsApi().card(key);
      if (!got.ok) throw new Unread(undefined);
      return got.value;
    },
  });

// The card's picture, a link to the page's own URL for the mouse alone: the card's text link is the keyboard's.
function Picture({ cardKey, size, href }: { cardKey: string; size: { width: number; height: number }; href: string }) {
  const src = pictureOf(cardKey);
  return src === undefined ? null : (
    <a href={href} {...LINK} tabIndex={-1} aria-hidden="true" className={styles["open"]}>
      <img
        className={styles["picture"]}
        src={src}
        width={size.width}
        height={size.height}
        alt=""
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
      />
    </a>
  );
}

// Remove: the line's card gone for everyone, the stream telling it back; a refusal said in words.
function Remove({ room, msgid }: { room: string; msgid: string }) {
  const store = useAppStore();
  const [state, setState] = useState<"idle" | "busy" | "failed">("idle");
  const remove = () => {
    setState("busy");
    pageCardsApi()
      .remove(room, msgid)
      .then(
        (got) => {
          if (got.ok) addCards(store).told([got.value]);
          else setState("failed");
        },
        () => {
          setState("failed");
        },
      );
  };
  return (
    <>
      <Button emphasis="quiet" size="s" icon="close" busy={state === "busy"} onClick={remove}>
        Remove preview
      </Button>
      {state === "failed" ? (
        <span className="meta" role="status">
          Could not remove the preview.
        </span>
      ) : null}
    </>
  );
}

export default function LinkCard({ cardKey, room, msgid, href, saving, removable, tabbable }: LinkCardProps) {
  const { data } = useQuery(cardOptions(cardKey), queryClient);
  if (data === undefined) return null;
  return (
    <div className={styles["card"]} data-link-card="">
      <Card compact>
        <Card.Header
          title={data.title}
          kicker={data.site === "" ? data.host : data.site}
          icon="link"
          meta={data.host}
        />
        <Card.Body>
          {saving || data.picture === null ? null : <Picture cardKey={cardKey} size={data.picture} href={href} />}
          {data.description === "" ? null : (
            <p dir="auto" className="meta">
              {data.description}
            </p>
          )}
          <Cluster>
            <a href={href} {...LINK} tabIndex={tabbable ? undefined : -1}>{`Open ${data.host}`}</a>
            {removable ? <Remove room={room} msgid={msgid} /> : null}
          </Cluster>
        </Card.Body>
      </Card>
    </div>
  );
}
