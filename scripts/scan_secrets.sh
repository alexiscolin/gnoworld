#!/bin/sh
# scan_secrets.sh [--staged]: gitleaks over what is staged, or over the whole history. Its rules
# are scripts/gitleaks.toml, which the sandbox cannot rewrite; the variables, a .gitleaksignore
# outside scripts/ and gitleaks:allow comments, which could turn the scan off, are ignored.
set -eu
here=$(cd "$(dirname "$0")" && pwd)
if [ -e .gitleaksignore ]; then # gitleaks reads it at the root whatever --gitleaks-ignore-path says
	echo "scan_secrets: a .gitleaksignore at the root would hide secrets; remove it (an exception goes in scripts/, with a reviewed commit)" >&2
	exit 1
fi
exec env -u GITLEAKS_CONFIG -u GITLEAKS_CONFIG_TOML gitleaks git --no-banner --redact \
	--config "$here/gitleaks.toml" --gitleaks-ignore-path "$here" --ignore-gitleaks-allow ${1:+"$1"} .
