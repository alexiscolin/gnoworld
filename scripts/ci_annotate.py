"""Each failed job's end as an annotation of gate-ok, which Claude reads through the public check-runs API with no login (D13177).
Usage: ci_annotate.py [--ids] <folder>, the folder holding jobs.json (GitHub's list of the run's jobs) and <id>.log a failed job's
log: --ids prints the failed jobs' ids, one a line; without it, one ::error line a failed job, ten at most."""
import json
import re
import sys

LINES, CHARS, MOST = 30, 4000, 10  # a step writes ten error annotations at most: past them, the tenth names the rest
FAILED = {"failure", "timed_out", "cancelled"}
STAMP = re.compile(r"^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z(?: |$)")
ANSI = re.compile(r"\x1b\[[0-9;]*[A-Za-z]")


def escape(text, title=False):
    """As GitHub's toolkit escapes a command's message, and its properties' : and , too (actions/toolkit, core/src/command.ts)."""
    text = text.replace("%", "%25").replace("\r", "%0D").replace("\n", "%0A")
    return text.replace(":", "%3A").replace(",", "%2C") if title else text


def failed(folder):
    """The failed jobs of jobs.json, in its order, as (id, name); a list it cannot read stops the step in one line."""
    try:
        with open(f"{folder}/jobs.json", encoding="utf-8") as f:
            listed = json.load(f)["jobs"]
        jobs = [(job["id"], job.get("name") or "") for job in listed if job.get("conclusion") in FAILED]
        bad = [i for i, _ in jobs if type(i) is not int]  # an id goes into a URL and a file name
        if bad:
            raise ValueError(f"a failed job's id is no integer: {bad[0]!r}")
        return jobs
    except (OSError, ValueError, KeyError, TypeError, AttributeError) as e:
        sys.exit(f"ci_annotate: no readable list of jobs in {folder}/jobs.json: {e}".replace("\n", " "))


def end(path):
    """The log's lines up to its first error, that line without its mark, the last 30 and their last 4000 characters; none if no log."""
    try:
        with open(path, "rb") as f:
            text = f.read().decode("utf-8", errors="replace").lstrip("\ufeff")
    except OSError:
        return ""
    lines = []
    for line in text.split("\n"):
        line = ANSI.sub("", STAMP.sub("", line.removesuffix("\r")))
        if line.strip() and not line.startswith("##[endgroup]"):
            lines.append(line.removeprefix("##[group]"))
    first = next((i for i, line in enumerate(lines) if line.startswith("##[error]")), None)
    if first is not None:
        lines = lines[:first] + [lines[first].removeprefix("##[error]")]
    return "\n".join(lines[-LINES:])[-CHARS:]


def main(argv):
    ids = argv[:1] == ["--ids"]
    args = argv[1:] if ids else argv
    if len(args) != 1:
        sys.exit("usage: ci_annotate.py [--ids] <folder>")
    jobs = failed(args[0])
    if ids:
        for i, _ in jobs:
            print(i)
        return
    shown = jobs if len(jobs) <= MOST else jobs[: MOST - 1]
    for i, name in shown:
        message = end(f"{args[0]}/{i}.log") or "no log was read for this job"
        print(f"::error title={escape(name, title=True)}::{escape(message)}")
    if len(jobs) > MOST:
        print(f"::error title=more failed jobs::{escape(', '.join(name for _, name in jobs[MOST - 1:]))}")


if __name__ == "__main__":
    main(sys.argv[1:])
