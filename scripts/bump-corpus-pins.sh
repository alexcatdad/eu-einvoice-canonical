#!/usr/bin/env bash
# Moves every pin in scripts/fetch-corpora.sh to the current head of its repository's default branch.
# Prints one line per corpus that moved. Used by .github/workflows/corpus-pins.yml, which opens the PR.
set -euo pipefail

file="${1:-scripts/fetch-corpora.sh}"
grep -E '^  "[^"|]+\|[^"|]+\|[0-9a-f]{40}\|' "$file" | while IFS='|' read -r name repo sha _; do
  name="${name#  \"}"
  # Only the ref named exactly HEAD: the pattern also matches refs such as refs/remotes/x/HEAD (odoo has some).
  head="$(git ls-remote "https://github.com/$repo.git" HEAD | awk '$2 == "HEAD" { print $1; exit }')"
  if ! [[ "$head" =~ ^[0-9a-f]{40}$ ]]; then
    echo "$name: could not read HEAD of $repo, pin kept" >&2
  elif [ "$head" != "$sha" ]; then
    sed -i.bak "s/$sha/$head/" "$file"
    rm -f "$file.bak"
    grep -q "$head" "$file" || { echo "$name: pin was not rewritten" >&2; exit 1; }
    echo "$name ($repo): ${sha:0:7} -> ${head:0:7}"
  fi
done
