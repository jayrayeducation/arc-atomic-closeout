"""Check the Git index for files and common high-confidence secret patterns.

Only paths are printed; candidate values are never written to logs.
"""

import re
import subprocess
import sys


def git(*args):
    return subprocess.check_output(["git", *args])


paths = [p.decode("utf-8") for p in git("ls-files", "-z").split(b"\0") if p]
excluded = re.compile(
    r"(^|/)(?:\.env(?:\..+)?|\.e2e-wallets\.json|node_modules|dist|out|cache|"
    r"broadcast|\.vercel)(?:/|$)",
    re.I,
)
bad_paths = [p for p in paths if p != ".env.example" and excluded.search(p)]
patterns = [
    re.compile(rb"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
    re.compile(rb"gh[pousr]_[A-Za-z0-9_]{30,}"),
    re.compile(rb"github_pat_[A-Za-z0-9_]{30,}"),
    re.compile(rb"sk-(?:proj-)?[A-Za-z0-9_-]{30,}"),
    re.compile(rb"AKIA[0-9A-Z]{16}"),
    re.compile(
        rb"(?i)(?:private[_-]?key|mnemonic|seed[_-]?phrase|api[_-]?key|"
        rb"access[_-]?token)\s*[:=]\s*['\"]?(?:0x[0-9a-f]{64}|[A-Za-z0-9_+/=-]{32,})"
    ),
]
hits = []
large = []
total_bytes = 0
for path in paths:
    blob = git("show", ":" + path)
    total_bytes += len(blob)
    if len(blob) > 5_000_000:
        large.append((path, len(blob)))
    if any(pattern.search(blob) for pattern in patterns):
        hits.append(path)

print(f"staged_files={len(paths)} total_bytes={total_bytes}")
print(f"sensitive_paths={bad_paths}")
print(f"secret_pattern_paths={hits}")
print(f"files_over_5MB={large}")
sys.exit(1 if bad_paths or hits or large else 0)
