#!/usr/bin/env -S -i LC_ALL=C @PYTHON3@ -I
"""land: the owner's one command for a pull request (D13211, D13213). A session drops a git bundle of one branch and the pull
request's text, `<branch>.bundle` and `<branch>.md` (the title, a blank line, the body), in its drop folder; `land`, run in the owner's
Terminal with no argument, copies them into a private folder, checks the bundle holds that one branch, fetches it and GitHub's main
into its own bare copy (git's object checks on), runs gitleaks over every commit and over the text, lists what the owner approves (the
subjects, each harness file touched with its lines added and removed, the declaration lines, any workflow file, how the branch on
GitHub changes, 16 hex of the tip), asks [y/N], then pushes that tip with the owner's gh login and opens the pull request or says the
one that exists. It reuses agent-pr's reading of the drop folder, its bare copy and its scans (scripts/agent_pr.py, beside it here and
once installed); the shebang empties the environment, and nothing of the caller's but the two files is read. The installer
writes in the python3 above and the folders TOOLS names, those its owner's PATH finds (D13412): this copy runs nowhere.
Usage: land"""
import importlib.machinery
import importlib.util
import os
import pwd
import re
import subprocess
import sys

HOME = pwd.getpwuid(os.getuid()).pw_dir
GITHUB = "https://github.com"
TOOLS = "@TOOLS@"
STATE = os.path.join(HOME, ".local/share/land")
SPACE = f"/private/tmp/claude-{os.getuid()}/land/"
# The harness list and the declarations a reviewer reads (records.sh, check_regressions.py, CLAUDE.md).
DECLARED = re.compile(r"^(?:Harness-changed|Removed-test|Lowered-floor|Updated-baseline|Red-pass|Finding):.*$", re.M)
STEM = re.compile(r"[a-z0-9][a-z0-9-]{0,62}")

here = os.path.dirname(os.path.realpath(__file__))
lib = os.path.join(here, "agent_pr.py")
_loader = importlib.machinery.SourceFileLoader("agent_pr", lib)
ap = importlib.util.module_from_spec(importlib.util.spec_from_loader("agent_pr", _loader))
_loader.exec_module(ap)
ap.STATE, ap.SPACE, ap.TOOLS = STATE, SPACE, TOOLS


def repository():
    """owner/name, which install_hooks.sh wrote from the checkout it ran in."""
    try:
        fd = os.open(os.path.join(STATE, "repo"), os.O_RDONLY | os.O_NOFOLLOW)
    except OSError:
        raise ap.Failed(f"no {STATE}/repo: run main's install_hooks.sh once") from None
    with os.fdopen(fd) as f:
        owner, _, name = f.read().strip().partition("/")
    if not (ap.OWNER.fullmatch(owner) and ap.NAME.fullmatch(name)):
        raise ap.Failed(f"{STATE}/repo holds no owner/name")
    return owner, name


def shown(text):
    """The text as the Terminal will draw it, or refused: a character it would not show as itself (an escape that hides or redraws
    the listing the owner approves, a bidi control) is never printed."""
    bad = [line for line in text.split("\n") if any(not c.isprintable() for c in line)]
    if bad:
        raise ap.Refused(f"the pull request holds a character the Terminal would not show as itself: {bad[0]!r}")
    return text


def escaped(text):
    """A refusal's text as written: what it quotes (a line gitleaks flagged, git's error) never reaches the Terminal as an escape."""
    return "".join(c if c.isprintable() or c == "\n" else repr(c)[1:-1] for c in text)


def base_checks(work, cache, base, tip):
    """What pre-push and commit-msg held for the owner's own push, as GitHub's main holds them: the secret scan of both rule sets over
    the range, and commit-msg on each message (its form, no attribution line, no secret)."""
    hooks = os.path.join(work, "hooks")
    os.makedirs(hooks)
    for path in (".githooks/commit-msg", "scripts/scan_secrets.sh", "scripts/gitleaks.toml", "scripts/gitleaks-private.toml", "scripts/.gitleaksignore"):
        with open(os.path.join(hooks, os.path.basename(path)), "w") as f:
            f.write(ap.git(work, "", "-C", cache, "show", f"{base}:{path}").stdout)
    environ = ap.env(work, GIT_DIR=cache)
    scanned = ap.run(["sh", os.path.join(hooks, "scan_secrets.sh"), "--range", f"{base}..{tip}"], environ, "the secret scan", ok=(0, 1))
    if scanned.returncode:
        raise ap.Refused(f"the secret scan of GitHub's main found a secret in the commits; nothing pushed:\n{scanned.stderr.strip()[-1500:]}")
    for sha in ap.git(work, "", "-C", cache, "rev-list", f"{base}..{tip}").stdout.split():
        message = os.path.join(work, "message")
        text = ap.git(work, "", "-C", cache, "log", "-1", "--format=%B", sha).stdout
        # commit-msg cuts what follows a scissors line, as `git commit -v` would, but git stored it and GitHub shows it.
        if re.search(r"^# -* >8 -*$", text, re.M):
            raise ap.Refused(f"commit {sha[:12]}'s message holds a scissors line, below which commit-msg reads nothing")
        with open(message, "w") as f:
            f.write(text)
        said = ap.run(["sh", os.path.join(hooks, "commit-msg"), message], environ, "commit-msg", ok=(0, 1))
        if said.returncode:
            raise ap.Refused(f"commit {sha[:12]}'s message, by GitHub's main's commit-msg: {said.stderr.strip()[-600:]}")


def unlink_dropped(branch):
    """The two files taken, removed through the drop folder opened as a folder at each step, never through a link put there since."""
    fd = os.open("/", os.O_RDONLY | os.O_DIRECTORY)
    try:
        for part in SPACE.strip("/").split("/"):
            nxt = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=fd)
            os.close(fd)
            fd = nxt
        for ext in (".bundle", ".md"):
            os.unlink(f"{branch}{ext}", dir_fd=fd)
    finally:
        os.close(fd)


def drop():
    """The one pull request waiting in the drop folder: its branch's name, the stem of its two files."""
    try:
        names = sorted(os.listdir(SPACE))
    except OSError:
        raise ap.Refused(f"no drop folder {SPACE}: nothing to land") from None
    stems = sorted({n.rsplit(".", 1)[0] for n in names if n.endswith((".bundle", ".md"))})
    if len(stems) != 1 or set(names) != {f"{stems[0]}.bundle", f"{stems[0]}.md"} or not STEM.fullmatch(stems[0]):
        raise ap.Refused(f"{SPACE} must hold one <branch>.bundle and its <branch>.md, nothing else: {names}")
    if stems[0] == "main":
        raise ap.Refused("main takes pull requests alone (D13165): name the branch otherwise")
    return stems[0]


def listing(work, cache, base, tip, branch, remote):
    """What the owner approves, as text."""
    g = lambda *a: ap.git(work, "", "-C", cache, *a).stdout
    out = [f"land: {branch}, {g('rev-list', '--count', f'{base}..{tip}').strip()} commit(s) on main"]
    out += ["  " + line for line in g("log", "--reverse", "--format=%h %s", f"{base}..{tip}").splitlines()]
    with open(os.path.join(work, "records.sh"), "w") as f:
        f.write(g("show", f"{base}:.githooks/records.sh"))
    numstat = ap.run(["sh", "-c", '. "$1" && harness --numstat "$2" "$3"', "sh", os.path.join(work, "records.sh"), base, tip],
                     ap.env(work, GIT_DIR=cache), "the harness list").stdout
    rows = [line.split("\t") for line in numstat.splitlines() if line]
    out.append(f"harness files touched ({len(rows)}):" if rows else "harness files touched: none")
    out += [f"  {path}  +{add} -{gone}" for add, gone, path in rows]
    declared = DECLARED.findall(g("log", "--format=%B", f"{base}..{tip}"))
    out.append(f"declaration lines ({len(declared)}):" if declared else "declaration lines: none")
    out += ["  " + line for line in declared]
    names = ap.touched(work, "", cache, base, tip)
    if any("\n" in n for n in names):
        raise ap.Refused("a file name holds a newline, which would print as a line of this listing of its own")
    runs = ap.runs(names)
    out.append("WORKFLOW FILES, which run on GitHub once pushed: " + ", ".join(runs) if runs else "workflow files: none")
    if not remote:
        out.append(f"on GitHub: a new branch {branch}")
    elif ap.git(work, "", "-C", cache, "merge-base", "--is-ancestor", remote, tip, ok=(0, 1)).returncode == 0:
        out.append(f"on GitHub: {branch} moves on from {remote[:12]}")
    else:
        out.append(f"on GitHub: {branch} at {remote[:12]} is REPLACED")
    out.append(f"tip: {tip[:16]}")
    return "\n".join(out)


def land(work):
    owner, name = repository()
    branch = drop()
    bundle = os.path.join(work, "pr.bundle")
    ap.take(f"{SPACE}{branch}.bundle", ap.BUNDLE_MAX, bundle)  # git's bundle reading below refuses a file that is none
    title, body = ap.pr_text(ap.take(f"{SPACE}{branch}.md", ap.PR_MAX, os.path.join(work, "pr.md")))
    url = f"{GITHUB}/{owner}/{name}.git"
    cache = ap.clean_copy(work, "", owner, name)
    git = lambda *a, **k: ap.git(work, "", "-C", cache, *a, **k)
    git("-c", "fetch.fsckObjects=true", "fetch", "-q", "--no-tags", url, "+refs/heads/main:refs/remotes/origin/main")
    # One head, a tag's or another branch's refused; git's fetch below finds the branch by its name, or fails.
    if len(git("bundle", "list-heads", bundle).stdout.splitlines()) != 1:
        raise ap.Refused(f"the bundle must hold one branch, {branch}, and nothing else")
    git("bundle", "verify", "-q", bundle)
    scratch = f"refs/land/{os.path.basename(work)}"
    try:
        git("-c", "fetch.fsckObjects=true", "fetch", "-q", "--no-tags", bundle, f"+refs/heads/{branch}:{scratch}")
        tip = git("rev-parse", "--verify", f"{scratch}^{{commit}}").stdout.strip()
        base = git("rev-parse", "--verify", "refs/remotes/origin/main^{commit}").stdout.strip()
        if git("merge-base", "--is-ancestor", base, tip, ok=(0, 1)).returncode:
            raise ap.Refused(f"{branch} does not start from GitHub's main ({base[:12]}): rebuild it on main")
        remote = git("ls-remote", url, f"refs/heads/{branch}").stdout.split("\t")[0].strip()
        base_checks(work, cache, base, tip)
        names = "\n".join(ap.touched(work, "", cache, base, tip))
        whole = git("cat-file", "--batch", given=git("rev-list", f"{base}..{tip}").stdout).stdout
        ap.scan_text(work, f"{branch}\n{title}\n{body}\n{whole}\n{names}", "the commits, their names, the title or the body")
        print(shown(listing(work, cache, base, tip, branch, remote) + f"\npull request: {title}"))
        print("Push it and open the pull request? [y/N] ", end="", flush=True)
        answer = sys.stdin.readline()
        if not sys.stdin.isatty():
            print()  # the answer typed ends the line in a terminal; read from a pipe, it does not
        if answer.strip() != "y":
            print("land: not confirmed; nothing pushed")
            return
        environ = ap.env(work, HOME=HOME)
        ap.run(["git", "-C", cache, "-c", "core.hooksPath=/dev/null", "-c", "credential.helper=", "-c", "credential.helper=!gh auth git-credential",
                "push", "-q", f"--force-with-lease=refs/heads/{branch}:{remote}", url, f"{tip}:refs/heads/{branch}"], environ, "git push")
    finally:
        git("update-ref", "-d", scratch, ok=(0, 1, 128))
    body_file = os.path.join(work, "body.md")
    with open(body_file, "w") as f:
        f.write(body)
    gh = ap.env(work, HOME=HOME, GH_PROMPT_DISABLED="1", GH_NO_UPDATE_NOTIFIER="1", NO_COLOR="1")
    found = ap.run(["gh", "pr", "list", f"--repo={owner}/{name}", f"--head={branch}", "--state=open", "--json=url", "--jq=.[0].url"], gh, "gh pr list")
    if found.stdout.strip():
        print(f"land: pushed {tip[:16]}; the pull request was there: {found.stdout.strip()}")
    else:
        made = ap.run(["gh", "pr", "create", f"--repo={owner}/{name}", "--base=main", f"--head={branch}", f"--title={title}",
                       f"--body-file={body_file}"], gh, "gh pr create")
        print(f"land: pushed {tip[:16]}; {made.stdout.strip()}")
    unlink_dropped(branch)


def main(argv):
    if argv:
        print("usage: land (no argument: the one pull request in the drop folder)", file=sys.stderr)
        return 2
    os.makedirs(os.path.join(STATE, "tmp"), mode=0o700, exist_ok=True)
    work = ap.tempfile.mkdtemp(dir=os.path.join(STATE, "tmp"))
    try:
        land(work)
        return 0
    except ap.Refused as e:
        print(f"land: refused: {escaped(str(e))}", file=sys.stderr)
        return 2
    except ap.Failed as e:
        print(f"land: {escaped(str(e))}", file=sys.stderr)
        return 1
    finally:
        ap.shutil.rmtree(work, ignore_errors=True)


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
