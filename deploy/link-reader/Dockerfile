# The link reader's own image (Alexis, 2026-11-11, D13919; docs/plans/link-previews.md): its workspace and the two packages it imports,
# with their production dependencies from the lockfile (htmlparser2 and the @jsquash WebAssembly codecs), then Node 24 alone in a
# distroless image, as 65530, a user no other service runs as. No secret, no volume, no server code, no test (.dockerignore).
# It reads public pages and pictures from strangers through its own way out (egress_links), so it holds nothing worth taking.
FROM node:24.22.0-alpine@sha256:44fce696f38ba8c987c4db89954051000bbd05ffd8d8659ba15ed4a8602e937f AS build
WORKDIR /repo
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/core/package.json packages/core/
COPY packages/schemas/package.json packages/schemas/
COPY link-reader/package.json link-reader/
RUN pnpm install --frozen-lockfile --prod --filter @gnoworld/link-reader...
COPY packages/core/src packages/core/src
COPY packages/schemas/src packages/schemas/src
COPY link-reader/src link-reader/src

FROM gcr.io/distroless/nodejs24-debian13:nonroot@sha256:78f07ef1b5ea71ad7c055df15d0dd8997f2d288f9158623c4d4ae3d765b7d50d
WORKDIR /app
COPY --from=build /repo /app
USER 65530:65530
# The JS heap at 90 MiB; the WebAssembly codecs' memory is outside it: the container's 256 MiB holds the measured peak of 210 MiB (2 Mpx cap) (F13951,
# link-reader/src/memory.test.ts).
CMD ["--disallow-code-generation-from-strings", "--max-old-space-size=90", "link-reader/src/main.ts"]
