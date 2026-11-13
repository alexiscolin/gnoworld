# jarvis's reader (10u-g2, D13987): gnomcp 0.11.0 alone, in its own release image (by digest, GitHub's provenance
# attestation names it), with the bridge and the relay of deploy/jarvis-reader/main.go (the standard library alone: no
# module is fetched) and the stack's probe for its health check. No Node, no secret, no volume: it is only gnomcp
# and the two small programs that give it a port and a way out. Its profiles are deploy/jarvis/gnomcp.toml.
FROM golang:1.26.2-alpine@sha256:f85330846cde1e57ca9ec309382da3b8e6ae3ab943d2739500e08c86393a21b1 AS build
WORKDIR /src
COPY deploy/jarvis-reader/ ./reader/
COPY deploy/probe/ ./probe/
RUN cd reader && CGO_ENABLED=0 go build -trimpath -ldflags=-s -o /out/reader . && \
	cd ../probe && CGO_ENABLED=0 go build -trimpath -ldflags=-s -o /out/probe .

FROM ghcr.io/gnoverse/gnomcp:0.11.0@sha256:b253d4238a236036b54cd6227c313e2609ce32dd361d71b2410d3096f6461a95
COPY --from=build /out/reader /reader
COPY --from=build /out/probe /probe
# gnomcp's profiles, every one read-only.
COPY deploy/jarvis/gnomcp.toml /etc/gnomcp/profiles.toml
ENTRYPOINT ["/reader"]
