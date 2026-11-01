// Answers of onyx-1 and gnoland-1, for lib/chain's contract tests and 5h's card. Each body is RECORDED through gnomcp between
// 2026-10-30T23:43Z and 23:52Z (gno_status, gno_render, gno_eval): the text gnomcp gave, its wrapper off, one last newline aside.
// FUNCTIONS and the envelope builders (chainEnvelopes.ts) are NOT recordings: gnomcp returns decoded text and has no qfuncs tool, so they
// are written from gno's source at v1.5.0 (file:line beside each). The chains run newer code, gnoland-1 v1.7.0 and onyx-1
// v1.7.0-rc.1 (PAGES' upgrade post, onyx's UPGRADES.md); the same places at tag v1.7.0 were compared through excerpts, not line
// by line. So these prove what lib/chain does with such an answer, not what a browser receives.

export const WUGNOT = "gno.land/r/gnoland/wugnot";

/** gno_status, first and last call of the recording: each read's height and block time. */
export const STATUS = {
  "onyx-1": [
    { height: 786661, time: "2026-10-30T23:43:10Z" },
    { height: 786798, time: "2026-10-30T23:51:42Z" },
  ],
  "gnoland-1": [
    { height: 1197823, time: "2026-10-30T23:43:10Z" },
    { height: 1197968, time: "2026-10-30T23:51:39Z" },
  ],
};

/** gno_render: what vm/qrender gave for `<realm>:<path>`. */
export const PAGES = [
  {
    chain: "gnoland-1",
    realm: WUGNOT,
    path: "",
    body: "# wrapped GNOT ($wugnot)\n\n* **Decimals**: 0\n* **Total supply**: 5187340191558\n* **Known accounts**: 217\n",
  },
  {
    chain: "onyx-1",
    realm: WUGNOT,
    path: "",
    body: "# wrapped GNOT ($wugnot)\n\n* **Decimals**: 0\n* **Total supply**: 1238848006\n* **Known accounts**: 17\n",
  },
  {
    chain: "onyx-1",
    realm: "gno.land/r/gnoland/coins",
    path: "",
    body: [
      "# Gno.land Coins Explorer",
      "",
      "This is a simple, readonly realm that allows users to browse native coin balances. Check your coin balance below!",
      "",
      '<gno-form path="balances">',
      '\t<gno-input name="address" type="text" placeholder="Valid bech32 address (e.g. g1..., cosmos1..., osmo1...)" />',
      '\t<gno-input name="coin" type="text" placeholder="Coin (e.g. ugnot)"" />',
      "</gno-form>",
      "",
      "Here are a few more ways to use this app:",
      "",
      "- `/r/gnoland/coins:balances?address=g1...` - show full list of coin balances of an address",
      "\t- [Example](/r/gnoland/coins:balances?address=g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5)",
      "- `/r/gnoland/coins:balances?address=g1...&coin=ugnot` - shows the balance of an address for a specific coin",
      "\t- [Example](/r/gnoland/coins:balances?address=g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5&coin=ugnot)",
      "- `/r/gnoland/coins:convert/<bech32_addr>` - convert a bech32 address to a Gno address",
      "\t- [Example](/r/gnoland/coins:convert/cosmos1jg8mtutu9khhfwc4nxmuhcpftf0pajdh6svrgs)",
      "- `/r/gnoland/coins:supply/<denom>` - shows the total supply of denom",
      "\t- Coming soon!",
      "",
      "",
    ].join("\n"),
  },
  {
    chain: "gnoland-1",
    realm: "gno.land/r/gnoland/blog",
    path: "p/mainnet-upgrade",
    body: [
      "<main class='gno-tmpl-page'>",
      "",
      "# Gno.land Mainnet Upgraded to v1.7.0",
      "",
      "Gno.land mainnet was upgraded to v1.7.0 on October 30, 2026. Validators halted together at a block height set by GovDAO and restarted on the new release, the first mainnet upgrade to block older binaries from resuming after the halt. Beforehand, the release was tested on the Onyx testnet and replayed against all 1,151,864 blocks of mainnet history with zero divergences.",
      "",
      "## Upgrade Details",
      "",
      "- Version: v1.7.0, released from chain/mainnet at commit e4c2e7d9f",
      "- Previous version: v1.5.1 (mainnet skipped v1.6.0)",
      "- Halt: block 1183000 at 09:04 UTC on October 30, 2026, set by [GovDAO proposal #15](https://gno.land/r/gov/dao:15)",
      "- Upgrade completed: 11:08 UTC on October 30, 2026",
      "- Tested on: Onyx, running v1.7.0-rc.1 on the same commit since block 754001",
      "",
      "## What's New",
      "",
      "The release brought a major refresh to gnoweb, including a new homepage, an Ask AI menu, omnisearch, search engine support, and richer realm pages with icons, frames, buttons, and math. It also included clearer error messages for developers, faster state queries, and a range of node and gpao fixes. The full list of changes is on the release page.",
      "",
      "## Links",
      "",
      "- GitHub release: [https://github.com/gnolang/gno/releases/tag/v1.7.0](https://github.com/gnolang/gno/releases/tag/v1.7.0)",
      "- Gnoweb: [https://gno.land](https://gno.land)",
      "- RPC: [https://rpc.gno.land](https://rpc.gno.land)",
      "- Gnockpit: [https://gnockpit.gno.land](https://gnockpit.gno.land)",
      "- Status: [https://status.gno.land](https://status.gno.land)",
      "- Tx-indexer: [https://indexer.gno.land/graphql](https://indexer.gno.land/graphql)",
      "",
      "---",
      "",
      "Tags: [#gnoland](/r/gnoland/blog:t/gnoland) [#ecosystem](/r/gnoland/blog:t/ecosystem) [#updates](/r/gnoland/blog:t/updates) [#mainnet](/r/gnoland/blog:t/mainnet) [#community](/r/gnoland/blog:t/community) [#blog](/r/gnoland/blog:t/blog)",
      "",
      "Written by ryanlee19 on 30 Oct 2026",
      "",
      "Published by g1manfred47kzduec920z88wfr64ylksmdcedlf5 to Gno.land's blog",
      "",
      "---",
      "<details><summary>Comment section</summary>",
      "",
      "</details>",
      "</main>",
    ].join("\n"),
  },
];

/** gno_eval: what vm/qeval gave for `<realm>.<expr>`. The last row has an argument, kept for its two lines of results. */
export const EVALS = [
  { chain: "gnoland-1", realm: WUGNOT, expr: "TotalSupply()", body: "(5187340191558 int64)" },
  { chain: "onyx-1", realm: WUGNOT, expr: "TotalSupply()", body: "(1238848006 int64)" },
  { chain: "gnoland-1", realm: "gno.land/r/sys/names", expr: "IsEnabled()", body: "(true bool)" },
  {
    chain: "gnoland-1",
    realm: "gno.land/r/sys/users",
    expr: 'ResolveName("aeddi")',
    body: '(&(struct{("g1aeddlftlfk27ret5rf750d7w5dume3kcsm8r8m" .uverse.address),("aeddi" string),(false bool)} gno.land/r/sys/users.UserData) *gno.land/r/sys/users.UserData)\n(true bool)',
  },
];

/** The chain evaluates whatever it is sent: an expression that is no call of one name still runs. Why evalCall.ts exists. */
export const ANY_EXPRESSION_RUNS = {
  chain: "onyx-1",
  realm: WUGNOT,
  expr: "TotalSupply() + TotalSupply()",
  body: "(2477696012 int64)",
};

/** gnomcp's text for a refused read, recorded; `error` is the `@type` gno's source gives it (vm/errors.go:58-59, abci/types/util.go:193). */
export const REFUSALS = [
  {
    chain: "gnoland-1",
    query: "vm/qrender",
    data: "gno.land/r/gnoland/doesnotexist:",
    text: "invalid package path",
    error: "/vm.InvalidPkgPathError",
  },
  {
    chain: "gnoland-1",
    query: "vm/qrender",
    data: "gno.land/r/sys/users/init:",
    text: "render function not declared",
    error: "/vm.NoRenderDeclError",
  },
  {
    chain: "onyx-1",
    query: "vm/qeval",
    data: "gno.land/r/gnoland/doesnotexist.TotalSupply()",
    text: "invalid package path",
    error: "/vm.InvalidPkgPathError",
  },
  {
    chain: "gnoland-1",
    query: "vm/qeval",
    data: `${WUGNOT}.NoSuchFunction()`,
    text: `${WUGNOT}:0:0: name NoSuchFunction not declared:\n--- preprocess stack ---\nstack 0: package ${WUGNOT}:0:0\n------------------------`,
    error: "/abci.StringError",
  },
  {
    chain: "onyx-1",
    query: "vm/qeval",
    data: `${WUGNOT}.Deposit()`,
    text: "invalid non-origin call",
    error: "/abci.StringError",
  },
  {
    chain: "onyx-1",
    query: "vm/qeval",
    data: `${WUGNOT}.TotalSupply()); Render("`,
    text: "1:14: expected 'EOF', found ')'",
    error: "/abci.StringError",
  },
];

const named = (Name: string, Type: string) => ({ Name, Type, Value: "" });
const CUR = named("cur", "realm");
const INT = [named(".res.0", "int64")];
const OWNER = named("owner", "address");

// NOT recorded. Names, parameters and order from wugnot.gno (gno_read full, gnoland-1); the JSON's shape from vm/types.go:45-62,
// vm/keeper.go:1786-1809 and vm/handler_test.go:202 (`.res.0`, a nil list as null). A `Type` other than a basic one is unproved:
// `gno.BaseOf(...).String()` (keeper.go:1795) was not run on `realm` or `address`, and lib/chain reads no `Type`.
export const FUNCTIONS = [
  { FuncName: "Deposit", Params: [CUR], Results: null },
  { FuncName: "Withdraw", Params: [CUR, named("amount", "int64")], Results: null },
  { FuncName: "Render", Params: [named("path", "string")], Results: [named(".res.0", "string")] },
  { FuncName: "TotalSupply", Params: null, Results: INT },
  { FuncName: "BalanceOf", Params: [OWNER], Results: INT },
  { FuncName: "Allowance", Params: [OWNER, named("spender", "address")], Results: INT },
  { FuncName: "Transfer", Params: [CUR, named("to", "address"), named("amount", "int64")], Results: null },
  { FuncName: "Approve", Params: [CUR, named("spender", "address"), named("amount", "int64")], Results: null },
  {
    FuncName: "TransferFrom",
    Params: [CUR, named("from", "address"), named("to", "address"), named("amount", "int64")],
    Results: null,
  },
];
