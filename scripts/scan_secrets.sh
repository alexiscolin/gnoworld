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
# Names live in text: an image's or a font's compressed bytes can spell one by chance (docs/harness.png
# did), so the private rules skip those files; the secret rules read every file (F139).
binaries=":(exclude,icase)*.png :(exclude,icase)*.jpg :(exclude,icase)*.jpeg :(exclude,icase)*.gif :(exclude,icase)*.webp :(exclude,icase)*.avif :(exclude,icase)*.ico :(exclude,icase)*.woff :(exclude,icase)*.woff2 :(exclude,icase)*.ktx2"
found=0 # both rule sets run, so a secret does not hide a private name beside it (F120)
for config in gitleaks.toml gitleaks-private.toml; do
	paths="" # every file, but for the private rules
	[ "$config" = gitleaks.toml ] || paths="-- . $binaries"
	if [ "${1:-}" = --staged ]; then
		# set -f: the pathspecs reach git as written; a failure stops the scan rather than scan nothing.
		staged=$(set -f && git diff --cached -U0 $text $paths)
		printf '%s\n' "$staged" | gitleaks stdin --no-banner --redact --config "$here/$config" --ignore-gitleaks-allow || found=1
	else
		# --log-opts replaces gitleaks's own log options, so they are given again before the text ones.
		opts="--full-history --all --diff-filter=tuxdb $text${paths:+ $paths}"
		# gitleaks scans nothing, and passes, when git refuses its options: git reads them first (F140).
		(set -f && git log -1 $opts >/dev/null) || { echo "scan_secrets: git cannot read the history with $opts" >&2; exit 1; }
		gitleaks git --no-banner --redact --config "$here/$config" --gitleaks-ignore-path "$here" --ignore-gitleaks-allow \
			--log-opts="$opts" . || found=1
	fi
done
exit "$found"
