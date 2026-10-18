#!/bin/sh
# scan_secrets.sh [--staged]: gitleaks over what is staged, or over the whole history. Its rules
# are scripts/gitleaks.toml, then gitleaks-private.toml (names a public repository must not hold),
# both files Claude cannot edit, and --config takes precedence over GITLEAKS_CONFIG(_TOML); a root
# .gitleaksignore and gitleaks:allow comments, which could turn the scan off, are refused or ignored.
# Git hands gitleaks every change as text, whatever an attribute, a NUL byte, a diff driver or a
# replace ref would show instead (F130, F132).
set -eu
here=$(cd "$(dirname "$0")" && pwd)
if [ -e .gitleaksignore ]; then # gitleaks reads it at the root whatever --gitleaks-ignore-path says
	echo "scan_secrets: a .gitleaksignore at the root would hide secrets; remove it (an exception goes in scripts/, with a reviewed commit)" >&2
	exit 1
fi
export GIT_NO_REPLACE_OBJECTS=1
text="--text --no-ext-diff --no-textconv"
if [ "${1:-}" = --staged ]; then
	staged=$(git diff --cached -U0 $text) # a failure stops the scan, rather than scanning nothing
fi
found=0 # both rule sets run, so a secret does not hide a private name beside it (F120)
for config in gitleaks.toml gitleaks-private.toml; do
	if [ "${1:-}" = --staged ]; then
		printf '%s\n' "$staged" | gitleaks stdin --no-banner --redact --config "$here/$config" --ignore-gitleaks-allow || found=1
	else
		# --log-opts replaces gitleaks's own log options, so they are given again before the text ones.
		gitleaks git --no-banner --redact --config "$here/$config" --gitleaks-ignore-path "$here" --ignore-gitleaks-allow \
			--log-opts="--full-history --all --diff-filter=tuxdb $text" . || found=1
	fi
done
exit "$found"
