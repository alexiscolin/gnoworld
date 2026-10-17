#!/bin/sh
# format_hook.sh: Claude Code's PostToolUse hook on Edit and Write (.claude/settings.json).
# It runs `eslint --fix`, then Prettier, on the file just written, so style never reaches
# the gate as a finding. It never blocks: what it cannot fix, the gate reports.
file=$(python3 -I -c 'import json, sys; print(json.load(sys.stdin).get("tool_input", {}).get("file_path", ""))' 2>/dev/null) || exit 0
cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0
case $file in
*.ts | *.tsx | *.css) pnpm exec eslint --fix --no-warn-ignored "$file" >/dev/null 2>&1 || : ;;
esac
case $file in
*.ts | *.tsx | *.css | *.mjs | *.json | *.yaml | *.yml) pnpm exec prettier --write --ignore-unknown --log-level silent "$file" >/dev/null 2>&1 || : ;;
esac
exit 0
