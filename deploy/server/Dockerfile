# The server in the stack (slice 3's plan, 3e): its workspace and the three it imports, with their production
# dependencies from the lockfile, then Node 24 alone in a distroless image, as 65532, the user Ergo shares for
# the auth socket. Node strips the types itself: server/src/main.ts runs as it is, as the tests run it.
FROM node:24.22.0-alpine@sha256:44fce696f38ba8c987c4db89954051000bbd05ffd8d8659ba15ed4a8602e937f AS build
WORKDIR /repo
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/core/package.json packages/core/
COPY packages/schemas/package.json packages/schemas/
COPY packages/service/package.json packages/service/
COPY server/package.json server/
RUN pnpm install --frozen-lockfile --prod --filter @gnoworld/server...
COPY packages/core/src packages/core/src
COPY packages/schemas/src packages/schemas/src
COPY packages/service/src packages/service/src
COPY server/src server/src
COPY server/roles.json server/
# The universes the app is built from: the default one's RPC is where the prices timer reads the block height (UNIVERSES_FILE).
COPY app/data/universes.json app/data/
RUN mkdir -p /data /markets /run/gnoworld && chown 65532:65532 /data /markets /run/gnoworld

FROM gcr.io/distroless/nodejs24-debian13:nonroot@sha256:78f07ef1b5ea71ad7c055df15d0dd8997f2d288f9158623c4d4ae3d765b7d50d
WORKDIR /app
COPY --from=build /repo /app
COPY --from=build --chown=65532:65532 /data /data
COPY --from=build --chown=65532:65532 /markets /markets
COPY --from=build --chown=65532:65532 /run/gnoworld /run/gnoworld
USER 65532:65532
CMD ["--disallow-code-generation-from-strings", "server/src/main.ts"]
