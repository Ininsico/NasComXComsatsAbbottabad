#!/usr/bin/env python3
"""Check or repair a deployment .env against deploy/.env.example.

The production env file is the one thing that is not in git, so it drifts: keys get
appended ad hoc, a value is added twice, a new setting is documented but never set. This
tool makes the drift visible and fixable.

    python deploy/scripts/normalize-env.py --check
    python deploy/scripts/normalize-env.py --write

Rules:
- The example defines the canonical order and the comments. The output follows it, so the
  file on the server documents itself exactly like the repository does.
- Values already present in the target are kept, never overwritten.
- A duplicate key keeps the last value, which is what dotenv itself does, and is reported.
- Keys present in the target but absent from the example are appended under a clear
  header rather than being silently dropped.
- Required secrets that are missing are generated with openssl, and the file is written
  with mode 600.
- --write backs the previous file up next to it first.
"""

from __future__ import annotations

import argparse
import datetime as dt
import os
import secrets
import shutil
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

DEFAULT_EXAMPLE = os.path.join(ROOT, "deploy", ".env.example")
DEFAULT_TARGET = "/opt/nascon/.env"

# Secrets the stack cannot run without. Generated only when missing.
GENERATED = {
    "JWT_SECRET": lambda: secrets.token_hex(48),
    "RABBITMQ_PASSWORD": lambda: secrets.token_hex(24),
    "GRAFANA_ADMIN_PASSWORD": lambda: secrets.token_hex(16),
    "DEPLOY_STATUS_TOKEN": lambda: secrets.token_hex(24),
}

# Values that must never be left as the example's placeholder in production.
PLACEHOLDERS = {
    "change-me",
    "your-",
    "image_tag",
    "ghcr.io/your-github-owner",
}


def parse(path):
    """Return (ordered pairs, duplicates, raw lines)."""
    pairs = []
    duplicates = []
    seen = {}
    lines = []

    with open(path, "r", encoding="utf-8") as handle:
        for number, raw in enumerate(handle, start=1):
            line = raw.rstrip("\n")
            lines.append(line)

            stripped = line.strip()

            if not stripped or stripped.startswith("#") or "=" not in stripped:
                continue

            key, value = stripped.split("=", 1)
            key = key.strip()
            value = value.strip()

            if key in seen:
                duplicates.append((key, seen[key], number))

            seen[key] = number
            pairs.append((key, value))

    values = {key: value for key, value in pairs}
    order = [key for key, _ in pairs]

    return values, order, duplicates, lines


REQUIRED = sorted(GENERATED) + ["PUBLIC_ORIGIN", "GROQ_API_KEY", "CLOUDINARY_CLOUD_NAME"]


def check(example, target):
    values, order, duplicates, _ = parse(target)
    example_values, _, _, _ = parse(example)

    missing = [key for key in example_values if key not in values]
    extra = [key for key in order if key not in example_values]
    empty = [key for key in REQUIRED if key in values and not values[key]]
    placeholders = [
        key
        for key, value in values.items()
        if any(marker in value.lower() for marker in PLACEHOLDERS)
    ]

    print(f"example: {example}")
    print(f"target : {target}")
    print(f"  keys in the example : {len(example_values)}")
    print(f"  keys in the target  : {len(values)}")
    print(f"  duplicates          : {[key for key, _, _ in duplicates] or 'none'}")
    print(f"  missing             : {missing or 'none'}")
    print(f"  extra (not in example): {extra or 'none'}")
    print(f"  empty but required  : {empty or 'none'}")
    print(f"  placeholder values  : {placeholders or 'none'}")

    problems = bool(duplicates or missing or empty or placeholders)

    print()
    print("problems found" if problems else "the env file is complete")

    return 1 if problems else 0


def render(example_lines, target_values, target_order, example_values):
    """Rebuild the file in the example's order, keeping target values."""
    out = []
    consumed = set()
    generated = []

    for line in example_lines:
        stripped = line.strip()

        if not stripped or stripped.startswith("#") or "=" not in stripped:
            out.append(line)
            continue

        key = stripped.split("=", 1)[0].strip()
        example_value = stripped.split("=", 1)[1].strip()

        if key in target_values and target_values[key]:
            value = target_values[key]
        elif key in GENERATED:
            value = GENERATED[key]()
            generated.append(key)
        else:
            value = target_values.get(key, example_value)

        # A secret left as the example's placeholder is not a secret. Replace it.
        if key in GENERATED and any(marker in value.lower() for marker in PLACEHOLDERS):
            value = GENERATED[key]()
            generated.append(key)

        out.append(f"{key}={value}")
        consumed.add(key)

    extra = [key for key in target_order if key not in consumed]

    if extra:
        out.append("")
        out.append("# ------------------------------------------------------------------ #")
        out.append("# Set on this host but not documented in deploy/.env.example.")
        out.append("# ------------------------------------------------------------------ #")

        for key in extra:
            out.append(f"{key}={target_values[key]}")

    # Collapse any run of more than two blank lines left by the example's section gaps.
    cleaned = []
    blanks = 0

    for line in out:
        if line.strip():
            blanks = 0
            cleaned.append(line)
        else:
            blanks += 1
            if blanks <= 2:
                cleaned.append("")

    return "\n".join(cleaned).rstrip("\n") + "\n", generated


def write(example, target):
    example_values, _, _, example_lines = parse(example)
    target_values, target_order, duplicates, _ = parse(target)

    content, generated = render(example_lines, target_values, target_order, example_values)

    stamp = dt.datetime.now().strftime("%Y%m%d-%H%M%S")
    backup = f"{target}.bak-{stamp}"

    shutil.copy2(target, backup)
    os.chmod(backup, 0o600)

    temporary = f"{target}.tmp-{stamp}"

    with open(temporary, "w", encoding="utf-8") as handle:
        handle.write(content)

    os.chmod(temporary, 0o600)
    os.replace(temporary, target)

    print(f"backed up to {backup}")
    print(f"wrote {target} ({len(content.splitlines())} lines, mode 600)")

    if duplicates:
        print(f"collapsed {len(duplicates)} duplicate key(s), keeping the last value")

    if generated:
        print(f"generated values for: {generated}")


def main():
    parser = argparse.ArgumentParser(description="Check or repair a deployment .env")
    parser.add_argument("--example", default=DEFAULT_EXAMPLE)
    parser.add_argument("--target", default=DEFAULT_TARGET)
    parser.add_argument("--check", action="store_true", help="report only, never write")
    parser.add_argument("--write", action="store_true", help="rewrite the target")

    args = parser.parse_args()

    if not os.path.exists(args.example):
        sys.exit(f"no example at {args.example}")

    if not os.path.exists(args.target):
        sys.exit(f"no target at {args.target}")

    if args.write:
        write(args.example, args.target)
        print()
        return check(args.example, args.target)

    return check(args.example, args.target)


if __name__ == "__main__":
    sys.exit(main())
