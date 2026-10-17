"""review_pass.py: the record that /pre-merge reviewed this code, so main takes only reviewed code.

The fingerprint is a commit's tree without the review's own files (docs/review-log.md and
docs/review-passes.txt): committing the record after the pass keeps it valid, and any
other change voids it. A pass counts once committed, in the commit that is checked.
Usage: review_pass.py record <commit> <lenses> | check <commit>"""
import datetime
import pathlib
import subprocess
import sys

OWN = {"docs/review-log.md", "docs/review-passes.txt"}
PASSES = "docs/review-passes.txt"


def git(*args, stdin=None):
    return subprocess.run(["git", *args], input=stdin, capture_output=True, text=True, check=True).stdout


def fingerprint(commit):
    kept = [line for line in git("ls-tree", "-r", commit).splitlines() if line.split("\t", 1)[1] not in OWN]
    return git("hash-object", "--stdin", stdin="\n".join(kept)).strip()


action, commit = sys.argv[1], sys.argv[2]
mark = fingerprint(commit)
if action == "record":
    with pathlib.Path(PASSES).open("a") as f:
        f.write(f"{datetime.date.today()} {mark} {sys.argv[3] if len(sys.argv) > 3 else ''}\n")
    print(f"review pass recorded for {mark}; commit {PASSES} with the review log")
else:
    try:
        recorded = git("show", f"{commit}:{PASSES}")
    except subprocess.CalledProcessError:
        recorded = ""
    if not any(line.split()[1:2] == [mark] for line in recorded.splitlines()):
        sys.exit(f"review_pass: no /pre-merge pass for this code ({mark[:12]}); run /pre-merge, commit its record, push again")
