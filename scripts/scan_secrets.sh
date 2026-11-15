#!/bin/sh
# scan_secrets.sh [--staged | --range <revision>...]: gitleaks over what is staged, over the commits the revisions name (a commit,
# ^commit, A..B; what a push sends, what a pull request adds: D13184, D13190), or over the whole history. Its rules
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
refuse() { echo "scan_secrets: --range takes commits, ^commits and A..B alone, one to scan at least: $1" >&2; exit 1; }
mode=all revs=""
case ${1:-} in
--staged) mode=staged ;;
--range)
	shift
	mode=range
	# Each a commit's full name: an option or a ref's name here would reach git log. One grep reads them all (a function a word
	# grew with the square of the remote's refs under macOS's sh).
	[ $# -gt 0 ] || refuse "no commit to scan"
	count=$(printf '%s\n' "$@" | grep -Ecvx '\^?[0-9a-f]{40}|[0-9a-f]{40}\.\.([0-9a-f]{40}|HEAD)') || :
	[ "$count" = 0 ] || refuse "$*"
	printf '%s\n' "$@" | grep -Eqvx '\^[0-9a-f]{40}' || refuse "no commit to scan"
	revs=" $*"
	;;
"") ;;
*)
	echo "usage: scan_secrets.sh [--staged | --range <revision>...]" >&2
	exit 1
	;;
esac
export GIT_NO_REPLACE_OBJECTS=1
# What only adds output to git's stderr (the traces, a verbose curl or merge) makes gitleaks read no history, and pass: none reaches it.
for var in $(env | sed -n 's/^\(GIT_TRACE[A-Za-z0-9_]*\)=.*/\1/p'); do unset "$var"; done
unset GIT_CURL_VERBOSE GIT_MERGE_VERBOSITY
# Config that changes what git log prints (colour, no diff for a root commit) does the same, in silence: git is given these afresh,
# above the repository's config and a -c of the caller's (git reads these last).
export GIT_CONFIG_COUNT=2 GIT_CONFIG_KEY_0=color.ui GIT_CONFIG_VALUE_0=never GIT_CONFIG_KEY_1=log.showRoot GIT_CONFIG_VALUE_1=true
text="--text --no-ext-diff --no-textconv"
# Names live in text: an image's or a font's compressed bytes can spell one by chance (docs/harness.png
# did), so the private rules skip those files; the secret rules read every file (F139).
binaries=":(exclude,icase)*.png :(exclude,icase)*.jpg :(exclude,icase)*.jpeg :(exclude,icase)*.gif :(exclude,icase)*.webp :(exclude,icase)*.avif :(exclude,icase)*.ico :(exclude,icase)*.woff :(exclude,icase)*.woff2 :(exclude,icase)*.ktx2"
found=0 # both rule sets run, so a secret does not hide a private name beside it (F120)
for config in gitleaks.toml gitleaks-private.toml; do
	paths="" # every file, but for the private rules
	[ "$config" = gitleaks.toml ] || paths="-- . $binaries"
	if [ "$mode" = staged ]; then
		# set -f: the pathspecs reach git as written; a failure stops the scan rather than scan nothing.
		staged=$(set -f && git diff --cached -U0 $text $paths)
		printf '%s\n' "$staged" | gitleaks stdin --no-banner --redact --config "$here/$config" --ignore-gitleaks-allow || found=1
	else
		# --log-opts replaces gitleaks's own log options, so they are given again before the text ones.
		opts="--full-history --all --diff-filter=tuxdb $text${paths:+ $paths}"
		[ "$mode" = all ] || opts="--full-history$revs --diff-filter=tuxdb $text${paths:+ $paths}"
		# gitleaks scans nothing, and passes, when git refuses its options: git reads them first (F140).
		err=$(set -f && git log -1 $opts 2>&1 >/dev/null) || { echo "scan_secrets: git cannot read the history with $opts" >&2; exit 1; }
		# gitleaks reads git's stderr as a failure of git, logs it, and scans nothing: with its own exit code 0.
		[ -z "$err" ] || { echo "scan_secrets: git writes to its stderr over this history, which gitleaks takes for no history: $err" >&2; exit 1; }
		rc=0
		out=$(gitleaks git --no-banner --redact --config "$here/$config" --gitleaks-ignore-path "$here" --ignore-gitleaks-allow \
			--log-opts="$opts" . 2>&1) || rc=$?
		printf '%s\n' "$out" >&2
		[ "$rc" = 0 ] || found=1
		printf '%s\n' "$out" | grep -q "stderr is not empty" && { echo "scan_secrets: gitleaks found git's stderr not empty, and read no history" >&2; exit 1; }
		scanned=$(printf '%s\n' "$out" | grep -Eo '[0-9]+ commits scanned' | grep -Eo '^[0-9]+' | tail -n 1) || :
		# A commit with no change is no commit to gitleaks, so a history of those alone scans none; one with a change must.
		if [ "${scanned:-0}" = 0 ] && [ -n "$(set -f && git log -p -U0 --format= $opts | head -c 1)" ]; then
			echo "scan_secrets: gitleaks scanned no commit of a history that has changes" >&2
			exit 1
		fi
	fi
done
exit "$found"
