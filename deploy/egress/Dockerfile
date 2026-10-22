# The demo's way out (slice 3's plan, 3e; decision 151): smokescreen, an HTTP CONNECT proxy that lets out the
# hosts its list names and refuses a private address after it resolves one, built from its source at v0.1.0
# (Go's checksum database holds the module to that version), with the forwarder's probe for its health check.
FROM golang:1.26.2-alpine@sha256:f85330846cde1e57ca9ec309382da3b8e6ae3ab943d2739500e08c86393a21b1 AS build
WORKDIR /src
COPY deploy/ergo/authforward/ ./
RUN CGO_ENABLED=0 go build -trimpath -ldflags=-s -o /out/probe . && \
	CGO_ENABLED=0 GOBIN=/out go install -trimpath -ldflags=-s github.com/stripe/smokescreen@v0.1.0

FROM gcr.io/distroless/static-debian13:nonroot@sha256:d62067879de890a1def9da0e7766b7d20810a5e5555cef8506b752437d7a3e88
COPY --from=build /out/smokescreen /smokescreen
COPY --from=build /out/probe /probe
COPY --chmod=644 deploy/egress/config.yaml deploy/egress/acl.yaml /etc/smokescreen/
USER 65532:65532
ENTRYPOINT ["/smokescreen", "--config-file", "/etc/smokescreen/config.yaml"]
