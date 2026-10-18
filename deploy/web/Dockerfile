# The demo's static server (docs/plans/slice-1c.md): the client built here from the lockfile, then
# served by nginx as a user with no rights. The build's context is the repository's root, which
# .dockerignore narrows to what the build reads.
FROM node:24.22.0-alpine@sha256:44fce696f38ba8c987c4db89954051000bbd05ffd8d8659ba15ed4a8602e937f AS build
WORKDIR /repo
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/core/package.json packages/core/
COPY app/package.json app/
RUN pnpm install --frozen-lockfile --filter @gnoworld/app
COPY app app
RUN cd app && node_modules/.bin/react-router build

FROM nginxinc/nginx-unprivileged:1.30.6-alpine-slim@sha256:4ac59c85c8c46d9e91eaabd2122cda4923ba380cf11f4138e389f069bcdc77a3
COPY deploy/web/nginx.conf /etc/nginx/nginx.conf
COPY --from=build /repo/app/build/client /usr/share/nginx/html
USER 101
