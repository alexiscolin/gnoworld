#!/bin/sh
# ergo.sh: the Ergo the server's tests start (slice 3b). It builds the pin of deploy/ergo/VERSION
# ("<tag> <commit>") into the tools' cache once, and again when the binary there is missing, of another
# version, or not the one built (its SHA-256 beside it), then prints its path. Run from the root.
set -eu
refuse() {
	echo "ergo.sh: $*" >&2
	exit 1
}
read -r tag commit extra <deploy/ergo/VERSION || refuse "deploy/ergo/VERSION holds no pin"
# The tag and the commit name a folder and a clone: nothing but their own characters passes.
case "$tag" in v[0-9]*) ;; *) refuse "deploy/ergo/VERSION: first a tag, such as v2.19.1" ;; esac
case "$tag" in *[!v0-9.]*) refuse "deploy/ergo/VERSION: first a tag, such as v2.19.1" ;; esac
case "$commit" in "" | *[!0-9a-f]*) refuse "deploy/ergo/VERSION: then the tag's commit, in hex" ;; esac
[ ${#commit} -eq 40 ] && [ -z "$extra" ] || refuse "deploy/ergo/VERSION: the tag and its 40-digit commit, nothing else"

dir="${GNOWORLD_TOOLS:-$HOME/.cache/gnoworld-tools}/ergo-$tag"
bin="$dir/ergo"
# A missing binary prints no version, and a missing hash fails its check: both rebuild.
if [ "$("$bin" --version 2>/dev/null || :)" = "ergo-$tag" ] && (cd "$dir" && shasum -a 256 -c ergo.sha256 >/dev/null 2>&1); then
	echo "$bin"
	exit 0
fi
command -v go >/dev/null 2>&1 || refuse "go is needed to build Ergo $tag (docs/DEVELOPMENT.md)"
# The clone, not the Go proxy: the tag's module path lacks its /v2, so the proxy refuses it (the spike).
[ -d "$dir/.git" ] || git clone -q --depth 1 --branch "$tag" https://github.com/ergochat/ergo.git "$dir" ||
	refuse "cannot clone Ergo $tag"
[ "$(git -C "$dir" rev-parse HEAD)" = "$commit" ] || refuse "the clone of $tag in $dir is not commit $commit"
# The sqlite tag, or persistent history refuses to start; the dependencies are vendored.
(cd "$dir" && CGO_ENABLED=0 go build -trimpath -tags "i18n mysql postgresql sqlite" \
	-ldflags "-X main.commit=$commit -X main.version=$tag" -o ergo .) || refuse "building Ergo $tag failed"
(cd "$dir" && shasum -a 256 ergo >ergo.sha256)
echo "$bin"
