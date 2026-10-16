#!/usr/bin/env bash
# Fixed shell harness: paths and pins arrive as arguments, never shell source.
set -euo pipefail
# shellcheck source=scripts/fetch-corpora.sh
source "$1"
dest="$2"
case "$3" in
  fetch) fetch_one sample fixture/corpus "$4" '/samples/' ;;
  batch)
    corpora=(
      "first|fixture/corpus|$4|/samples/"
      'missing|fixture/corpus|0000000000000000000000000000000000000000|/samples/'
      "last|fixture/corpus|$4|/samples/"
    )
    CORPUS_FETCH_JOBS=2 main
    ;;
  invalid) CORPUS_FETCH_JOBS=0 main ;;
  *) exit 1 ;;
esac
