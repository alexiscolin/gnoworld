// The one read of the public indexer (slice 5 part 2, 5k; D112): a realm's facts, through `readChain` and a Zod schema, one
// GET of an https address with the limits of read.ts, a source and a time on every result, no polling. onyx-1's indexer has no
// `realmFacts` (F4875): the facts are the realm's deploy, its first successful MsgAddPackage, as recorded in
// app/tests/chain/onyxRealmDeploy.json. The indexer has no time field (F2950), so every fact carries its age as a block height
// and no chart by date stands on it (F2974).
import {
  LAST_CALLS,
  RealmCallsAnswer,
  RealmDeployAnswer,
  REALM_FACTS_CAPS,
  type LastCall,
  type LastCallsValue,
  type RealmFactsValue,
} from "@gnoworld/schemas/indexer";
import { failedRead, readChain, sourceOf, type ChainRead, type ReadOptions } from "./read.ts";

// A filter on a message's value lets a message of another type through (history.ts, 7k3): the type is chosen by `typeUrl`, and the reader
// still checks that the message it reads added the path asked.
const DEPLOY_QUERY =
  'query($path: String!) { getTransactions(where: { success: { eq: true }, messages: { typeUrl: { eq: "add_package" }, value: { MsgAddPackage: { package: { path: { eq: $path } } } } } }, order: { heightAndIndex: ASC }, limit: 1) { block_height messages { value { __typename ... on MsgAddPackage { creator package { path } } } } } }';

/** A realm's facts from the indexer at `indexer` (its GraphQL address), for a path its caller checked, or why not. */
export async function readFacts(
  indexer: string,
  path: string,
  options: ReadOptions = {},
): Promise<ChainRead<RealmFactsValue>> {
  // A name past the cap is refused before anything is asked.
  if (path.length > REALM_FACTS_CAPS.path) return failedRead("bad-name", sourceOf(indexer, options));
  const asked = `${indexer}?query=${encodeURIComponent(DEPLOY_QUERY)}&variables=${encodeURIComponent(JSON.stringify({ path }))}`;
  const answer = await readChain(asked, RealmDeployAnswer, options);
  if (!answer.ok) return answer;
  const [deploy] = answer.value.data.getTransactions ?? [];
  if (deploy === undefined) return failedRead("no-realm", answer.source);
  const added = deploy.messages.find(
    ({ value }) => value.__typename === "MsgAddPackage" && value.package?.path === path,
  )?.value;
  // A transaction that adds no package of this path is not this realm's deploy.
  if (added === undefined) return failedRead("wrong-shape", answer.source);
  return {
    ok: true,
    value: {
      path,
      firstBlock: deploy.block_height,
      ...(added.creator === undefined ? {} : { deployer: added.creator }),
    },
    source: answer.source,
  };
}

// The newest calls to a path, with the newest block (one request). The value's filter alone lets a message of another type through (it
// returned create_session transactions, probed 2026-11-08): the type is chosen by `typeUrl` too, and each message is checked again.
const CALLS_QUERY = `query($path: String!) { latestBlockHeight getTransactions(where: { success: { eq: true }, messages: { typeUrl: { eq: "exec" }, value: { MsgCall: { pkg_path: { eq: $path } } } } }, order: { heightAndIndex: DESC }, limit: ${String(LAST_CALLS)}) { block_height messages { value { __typename ... on MsgCall { caller pkg_path func } } } } }`;

/** A realm's newest calls, newest first, for a path its caller checked, or why not. */
export async function readLastCalls(
  indexer: string,
  path: string,
  options: ReadOptions = {},
): Promise<ChainRead<LastCallsValue>> {
  if (path.length > REALM_FACTS_CAPS.path) return failedRead("bad-name", sourceOf(indexer, options));
  const asked = `${indexer}?query=${encodeURIComponent(CALLS_QUERY)}&variables=${encodeURIComponent(JSON.stringify({ path }))}`;
  const answer = await readChain(asked, RealmCallsAnswer, options);
  if (!answer.ok) return answer;
  const calls = (answer.value.data.getTransactions ?? []).flatMap(({ block_height: height, messages }) =>
    messages.flatMap(({ value: { __typename, caller, pkg_path, func } }): LastCall[] =>
      __typename === "MsgCall" && pkg_path === path && caller !== undefined && func !== undefined
        ? [{ caller, func, height }]
        : [],
    ),
  );
  return {
    ok: true,
    value: { tip: answer.value.data.latestBlockHeight, calls: calls.slice(0, LAST_CALLS) },
    source: answer.source,
  };
}
