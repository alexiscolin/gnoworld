# jarvis's own image (Alexis, 2026-11-04, "Son propre paquet et image"; ADR-0002 §5, §7): its workspace and the packages
# it imports, with their production dependencies from the lockfile, its skills and the places' data,
# then Node 24 alone in a distroless image, as 65533, a user no other service runs as. No server code, no script, no test
# and no test helper (.dockerignore; jarvis/src/main.test.ts holds the list). No gnomcp: it runs in the reader's container
# (deploy/jarvis-reader/Dockerfile, 10u-g2), which jarvis reaches over the network, so nothing jarvis runs can start it.
FROM node:24.22.0-alpine@sha256:44fce696f38ba8c987c4db89954051000bbd05ffd8d8659ba15ed4a8602e937f AS build
WORKDIR /repo
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/core/package.json packages/core/
COPY packages/schemas/package.json packages/schemas/
COPY packages/service/package.json packages/service/
COPY packages/chain/package.json packages/chain/
COPY jarvis/package.json jarvis/
RUN pnpm install --frozen-lockfile --prod --filter @gnoworld/jarvis...
COPY packages/core/src packages/core/src
COPY packages/schemas/src packages/schemas/src
COPY packages/service/src packages/service/src
COPY packages/chain/src packages/chain/src
COPY jarvis/src jarvis/src
COPY jarvis/skills jarvis/skills
# The places' data files, which find_place and the cards read (JARVIS_DATA_DIR's default, ../../app/data from config.ts).
COPY app/data app/data
RUN mkdir -p /data && chown 65533:65533 /data

FROM gcr.io/distroless/nodejs24-debian13:nonroot@sha256:78f07ef1b5ea71ad7c055df15d0dd8997f2d288f9158623c4d4ae3d765b7d50d
WORKDIR /app
COPY --from=build /repo /app
COPY --from=build --chown=65533:65533 /data /data
USER 65533:65533
# The heap at 70% of the container's 384 MiB (ADR-0002 §7).
CMD ["--disallow-code-generation-from-strings", "--max-old-space-size=268", "jarvis/src/main.ts"]
