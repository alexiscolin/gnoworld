"""load.py: the machine's 1-minute load average and its cores, in tenths ("170 160"), for bench.py, which waits
for a machine quieter than its cores before it measures (Alexis, 2026-10-26).
Usage: load.py."""
import os

print(round(os.getloadavg()[0] * 10), (os.cpu_count() or 1) * 10)
