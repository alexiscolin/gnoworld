# link-reader

The link reader fetches the head and the picture of a public web page so the chat can show a
card under a line that links it. It is its own Node service and its own image. Only the server
calls it. It holds the rules that keep it from reaching private addresses.

Link cards are off unless `LINK_CARDS=1` is set in the deployment.

## What is in it

`src/`:

- `main.ts`, `config.ts`: the process and its settings (`LINKS_LISTEN`, `LINKS_PROXY`,
  `LINKS_MAX`, and `LINKS_DIRECT=1` for development).
- `server.ts`: the HTTP side. `POST /card` takes a URL and answers a card, or a refusal.
  `GET /health` is for the container check. Nothing else is served.
- `url.ts`, `address.ts`: which URLs and which addresses are allowed. Only public addresses pass.
- `fetch.ts`, `transport.ts`, `body.ts`: one guarded fetch. The URL and the resolved address are
  checked at every redirect, and the response has a size cap and a time cap.
- `head.ts`: reads the title and description from a page's head.
- `picture.ts`: checks a picture by its first bytes, then re-encodes it to a small JPEG.
- `card.ts`: puts the head and the picture together into one card.
- `*.test.ts`, `testImages.ts`, `tlsFixtures.ts`, `testdata/`: the tests and what they use.

## Build, test and run

From the repository root, after `pnpm install`:

```sh
pnpm run test        # all unit tests, this folder's included
pnpm run typecheck
pnpm run lint
```

The package has no scripts of its own. The image starts the reader with
`node --disallow-code-generation-from-strings link-reader/src/main.ts`
(see `deploy/link-reader/Dockerfile`). In production it must be given a proxy, which is the only
way out it may use. For local work, `LINKS_DIRECT=1` lets it fetch without one.

The network checks need Docker: `sh deploy/test-links.sh`.

## Rules

- This folder imports `core`, `schemas` and `service`, never `server`, `jarvis` or the app
  ([docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md)).
- A fetch never skips the address checks.
- The rules for this folder are in [.claude/rules/typescript.md](../.claude/rules/typescript.md).
- The allowed hosts of its way out are in `deploy/egress/links-acl.yaml` and
  `deploy/egress/reader-acl.yaml`.
