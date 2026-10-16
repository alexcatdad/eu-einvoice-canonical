#!/usr/bin/env bash
# Downloads the latest successful corpus-report artifact to site/.generated/corpus-report.json, where the site build
# (site/prepare.ts) renders the Real-world results page from it. Run it before `bun run build:site`.
# Needs GH_TOKEN and `actions: read`. Prefers a run on main; falls back to any branch so a pull request
# can show its own page. Without a report the site builds the page's placeholder: this script never fails the build.
set -uo pipefail

dest="${1:-site/.generated}"
tmp="$(mktemp -d)"
mkdir -p "$dest"

run_id=""
for branch in "--branch main" ""; do
  # shellcheck disable=SC2086
  run_id="$(gh run list --workflow corpus.yml --status success $branch --limit 1 --json databaseId --jq '.[0].databaseId // empty' 2>/dev/null)" || run_id=""
  [ -n "$run_id" ] && break
done
if [ -z "$run_id" ]; then
  echo "No successful corpus run yet: the Real-world results page stays a placeholder."
  exit 0
fi
if ! gh run download "$run_id" --name corpus-report --dir "$tmp" 2>/dev/null || [ ! -f "$tmp/corpus-report.json" ]; then
  echo "Corpus run $run_id has no corpus-report artifact: the Real-world results page stays a placeholder."
  exit 0
fi
cp "$tmp/corpus-report.json" "$dest/corpus-report.json"
echo "Corpus report from run $run_id saved to $dest/corpus-report.json."
exit 0
