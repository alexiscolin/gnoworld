#!/bin/sh
# scan_secrets.sh [--staged]: gitleaks over what is staged, or over the whole history. Its rules
# are scripts/gitleaks.toml, then gitleaks-private.toml (names a public repository must not hold),
# which the sandbox cannot rewrite, and --config takes precedence over
# GITLEAKS_CONFIG(_TOML); a root .gitleaksignore and gitleaks:allow comments, which could turn the
# scan off, are refused or ignored.
set -eu
here=$(cd "$(dirname "$0")" && pwd)
if [ -e .gitleaksignore ]; then # gitleaks reads it at the root whatever --gitleaks-ignore-path says
	echo "scan_secrets: a .gitleaksignore at the root would hide secrets; remove it (an exception goes in scripts/, with a reviewed commit)" >&2
	exit 1
fi
found=0 # both rule sets run, so a secret does not hide a private name beside it (F120)
for config in gitleaks.toml gitleaks-private.toml; do
	gitleaks git --no-banner --redact \
		--config "$here/$config" --gitleaks-ignore-path "$here" --ignore-gitleaks-allow ${1:+"$1"} . || found=1
done
exit "$found"
