# Ergo in the stack (slice 3's plan, 3e): the project's own image at the pinned tag (deploy/ergo/VERSION), by
# digest, with gnoworld's settings rendered at each start (render.sh) and its auth script's forwarder, built
# here. It runs as 65532, the server's user too, so both reach the auth socket's volume.
FROM golang:1.26.2-alpine@sha256:f85330846cde1e57ca9ec309382da3b8e6ae3ab943d2739500e08c86393a21b1 AS forwarder
WORKDIR /src
COPY deploy/ergo/authforward/ ./
RUN CGO_ENABLED=0 go build -trimpath -ldflags=-s -o /authforward .

FROM ghcr.io/ergochat/ergo:v2.19.1@sha256:ef885e44f7fa19101bbbc41baef11dc280dc8107465dccaf6f0860f41b48a682
COPY --from=forwarder /authforward /ircd-bin/authforward
COPY --chmod=644 deploy/ergo/ircd.yaml.tmpl /ergo/ircd.yaml.tmpl
COPY --chmod=755 deploy/ergo/render.sh /ergo/render.sh
RUN mkdir -p /data /run/gnoworld && chown 65532:65532 /data /run/gnoworld
USER 65532:65532
ENTRYPOINT ["/bin/sh", "/ergo/render.sh"]
