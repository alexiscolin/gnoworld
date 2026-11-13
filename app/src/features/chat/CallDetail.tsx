// A call's detail, in the panel a chain line opens: what the call was given and what it cost, its block and time, its result and the events
// it told. The server cut and stripped every text of it; each is cut and stripped again here and drawn as text only, never a link or markup.
import { CALL_DETAIL_CAPS, RealmPath, type CallDetail as Detail } from "@gnoworld/schemas";
import { grouped, Kicker, Row, Skeleton, Stack } from "@gnoworld/ui";
import { useQuery } from "@tanstack/react-query";
import { ErrorView, useWhere, type ErrorKind } from "../errors/index.ts";
import { cut } from "../../lib/chainText.ts";
import { isUnread, queryClient } from "../../lib/query/client.ts";
import { realmPath } from "../../places.ts";
import { callOptions } from "./callQueries.ts";
import styles from "./CallDetail.module.css";
import shared from "./lists.module.css";

// How a failed read is told: a hash the indexer does not hold, a visitor asking too fast, any other fault.
function kindOf(error: unknown): ErrorKind {
  const reason = isUnread<{ reason?: string }>(error) ? error.read.reason : undefined;
  if (reason === "not_found") return "not-found";
  return reason === "too_many" ? "too-many" : "unavailable";
}

// A list of positional texts, which may repeat: each is kept with its place.
function Texts({ title, items, more }: { title: string; items: readonly string[]; more: number }) {
  if (items.length === 0) return null;
  return (
    <Stack space="3xs">
      <Kicker>{title}</Kicker>
      <ol className={shared["plain"]}>
        {items
          .map((text, place) => ({ place, text }))
          .map(({ place, text }) => (
            <li key={place} className={styles["data"]}>
              {text}
            </li>
          ))}
      </ol>
      {more === 0 ? null : <p className="meta">and {grouped(more)} more</p>}
    </Stack>
  );
}

function Head({ detail }: { detail: Detail }) {
  const { func, realm, success, error, height, time } = detail;
  const when = time === null ? "" : ` · ${time.slice(0, 16).replace("T", " ")} UTC`;
  return (
    <>
      <Row
        look="plain"
        title={cut(func, 64)}
        subtitle={cut(realm, 64).replace("gno.land/", "")}
        trail={<span className={success ? undefined : styles["failed"]}>{success ? "Succeeded" : "Failed"}</span>}
        {...(RealmPath.safeParse(realm).success ? { href: realmPath(realm) } : {})}
      />
      {error === null ? null : (
        <p className={[styles["data"], styles["failed"]].join(" ")}>{cut(error, CALL_DETAIL_CAPS.error)}</p>
      )}
      <p className="meta">{`block ${grouped(height)}${when}`}</p>
    </>
  );
}

function Cost({ gas, fee }: Pick<Detail, "gas" | "fee">) {
  const paid = fee === null ? "" : `; fee ${grouped(fee.amount)} ${cut(fee.denom, 16)}`;
  return <p className="meta">{`Gas ${grouped(gas.used)} of ${grouped(gas.wanted)} wanted${paid}`}</p>;
}

const eventText = ({ type, attrs }: Detail["events"][number]): string => {
  const pairs = attrs.map(
    ({ key, value }) => `${cut(key, CALL_DETAIL_CAPS.key)}: ${cut(value, CALL_DETAIL_CAPS.value)}`,
  );
  return `${cut(type, CALL_DETAIL_CAPS.type)}${pairs.length === 0 ? "" : ` (${pairs.join(", ")})`}`;
};

function Body({ detail }: { detail: Detail }) {
  const { gas, fee, send, memo, args, moreArgs, events, moreEvents } = detail;
  return (
    <Stack space="s">
      <Head detail={detail} />
      <Cost gas={gas} fee={fee} />
      <Texts
        title="Arguments"
        items={args.map((arg, at) => `${String(at)}: ${cut(arg, CALL_DETAIL_CAPS.arg)}`)}
        more={moreArgs}
      />
      {send === null ? null : <p className="meta">Sent {cut(send, 64)}</p>}
      {memo === null ? null : <p className="meta">Memo: {cut(memo, CALL_DETAIL_CAPS.memo)}</p>}
      <Texts title="Events" items={events.map(eventText)} more={moreEvents} />
    </Stack>
  );
}

/** The call at message `index` of the transaction `hash`, read when the panel opens. */
export default function CallDetail({ hash, index }: { hash: string; index: number }) {
  const where = useWhere();
  const { data, error, isError, refetch } = useQuery(callOptions(hash, index), queryClient);
  if (isError)
    return (
      <div className={styles["detail"]}>
        <ErrorView
          kind={kindOf(error)}
          size="inline"
          where={where}
          onRetry={() => {
            refetch().catch(reportError);
          }}
        />
      </div>
    );
  return <div className={styles["detail"]}>{data === undefined ? <Skeleton lines={3} /> : <Body detail={data} />}</div>;
}
