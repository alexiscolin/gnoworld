"""guard_gno.py: Claude Code's PreToolUse hook (.claude/settings.json). Everything about gno
goes through gnomcp (.claude/rules/gno.md): a .gno file, realm or pure package, is written only
after the session called a gnomcp tool; gnokey, raw RPC calls and fetched realm pages are
refused. The local toolchain (gno test, gno lint, gnodev) stays free. Exit 2 blocks the call."""
import json
import re
import sys


def refuse(why):
    print(f"guard_gno: {why}. Everything about gno goes through gnomcp (.claude/rules/gno.md).", file=sys.stderr)
    sys.exit(2)


def asked_gnomcp(node):
    """Whether the transcript holds a gnomcp tool call; a mention in text does not count."""
    if isinstance(node, dict):
        if node.get("type") == "tool_use" and str(node.get("name", "")).startswith("mcp__gnomcp__"):
            return True
        return any(asked_gnomcp(v) for v in node.values())
    return isinstance(node, list) and any(asked_gnomcp(v) for v in node)


def session_asked(transcript):
    try:
        with open(transcript) as f:
            return any(asked_gnomcp(json.loads(line)) for line in f if "mcp__gnomcp__" in line)
    except (OSError, ValueError):
        return False


try:
    event = json.load(sys.stdin)
    tool, given = event["tool_name"], event.get("tool_input", {})
except (ValueError, KeyError, TypeError):
    refuse("unreadable hook input")

if tool in ("Edit", "Write") and str(given.get("file_path", "")).endswith(".gno"):
    if not session_asked(event.get("transcript_path", "")):
        refuse("no .gno before reading the chain: load the gno skill, then gno_packages or gno_read on a realm of the same shape")
elif tool == "Bash":
    command = given.get("command", "")
    if re.search(r"(^|[\s;&|(])gnokey(\s|$)", command):
        refuse("gnokey: writes and keys go through gnomcp (gno_call, gno_addpkg, sessions)")
    if re.search(r"https?://rpc[\w.-]*\.gno\.land", command):
        refuse("a raw RPC call: read the chain with gno_read, gno_render or gno_eval")
elif tool == "WebFetch":
    url = given.get("url", "")
    if re.match(r"https?://rpc[\w.-]*\.gno\.land", url) or re.match(r"https?://([\w-]+\.)*gno\.land/[rp]/", url):
        refuse("a realm page or an RPC node: read it with gno_render or gno_read")
