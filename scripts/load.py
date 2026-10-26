"""load.py: the machine's 1-minute load average and its cores, in tenths ("170 160"), for check.sh's budget: a fast
gate past its budget on a machine busier than its cores measured the machine, not the code (Alexis, 2026-10-26).
Usage: load.py."""
import os

print(round(os.getloadavg()[0] * 10), (os.cpu_count() or 1) * 10)
