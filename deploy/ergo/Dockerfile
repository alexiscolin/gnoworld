# Ergo in the stack (slice 3's plan, 3e): the project's own image at the pinned tag (deploy/ergo/VERSION), by
# digest, with gnoworld's settings rendered at each start (render.sh) and a probe for its health check. It runs
# as 65532, the server's user too, so Ergo dials the auth socket the server makes in their shared volume.
FROM golang:1.26.2-alpine@sha256:f85330846cde1e57ca9ec309382da3b8e6ae3ab943d2739500e08c86393a21b1 AS probe
WORKDIR /src
COPY deploy/probe/ ./
RUN CGO_ENABLED=0 go build -trimpath -ldflags=-s -o /probe .

FROM ghcr.io/ergochat/ergo:v2.19.1@sha256:ef885e44f7fa19101bbbc41baef11dc280dc8107465dccaf6f0860f41b48a682
COPY --from=probe /probe /ircd-bin/probe
COPY --chmod=644 deploy/ergo/ircd.yaml.tmpl /ergo/ircd.yaml.tmpl
COPY --chmod=755 deploy/ergo/render.sh /ergo/render.sh
# A COPY --chmod=644 makes /ergo 644 too, closed to Ergo's user (moby/buildkit#5943): it is opened here.
RUN chmod 755 /ergo && mkdir -p /data /run/gnoworld && chown 65532:65532 /data /run/gnoworld
USER 65532:65532
ENTRYPOINT ["/bin/sh", "/ergo/render.sh"]
