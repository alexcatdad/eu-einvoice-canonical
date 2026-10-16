#!/usr/bin/env bash
# Downloads the latest successful corpus-report artifact and renders dist/corpus.html from it.
# Needs GH_TOKEN and `actions: read`. Prefers a run on main; falls back to any branch so a pull request
# can show its own page. Without a report it builds without the page: this script never fails the build.
set -uo pipefail

dest="${1:-dist}"
tmp="$(mktemp -d)"

run_id=""
for branch in "--branch main" ""; do
  # shellcheck disable=SC2086
  run_id="$(gh run list --workflow corpus.yml --status success $branch --limit 1 --json databaseId --jq '.[0].databaseId // empty' 2>/dev/null)" || run_id=""
  [ -n "$run_id" ] && break
done
if [ -z "$run_id" ]; then
  echo "No successful corpus run yet: building without the Real-world results page."
  exit 0
fi
if ! gh run download "$run_id" --name corpus-report --dir "$tmp" 2>/dev/null || [ ! -f "$tmp/corpus-report.json" ]; then
  echo "Corpus run $run_id has no corpus-report artifact: building without the Real-world results page."
  exit 0
fi
if bun scripts/corpus-page.ts "$tmp/corpus-report.json" "$dest/corpus.html" "$dest/index.html"; then
  cp "$tmp/corpus-report.json" "$dest/corpus-report.json"
  echo "Real-world results page built from corpus run $run_id."
else
  # dist/corpus.html stays the placeholder the site build wrote, so the navigation link never dead-ends.
  echo "Could not render the corpus report: building without the Real-world results page."
fi
exit 0
