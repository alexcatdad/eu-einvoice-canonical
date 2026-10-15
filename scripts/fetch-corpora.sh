#!/usr/bin/env bash
# Fetches the public sample corpora at pinned commits into test/corpus/repos/ (git-ignored).
# Only the folders that hold sample documents are checked out, with blobs fetched on demand,
# because phive-rules alone is over 3 GB with its rule sets.
#
# Bump a pin deliberately: the known-answer manifest test/corpus/expected.json lists files by
# path, so regenerate it with scripts/corpus-manifest.ts after moving one.
set -euo pipefail

dest="${1:-test/corpus/repos}"
mkdir -p "$dest"

# name | repository | pinned commit | sparse-checkout patterns (space separated)
corpora=(
  "phive-rules|phax/phive-rules|58e8c8313c31dd818c942cc1e419afab31a4a900|/*/src/test/resources/external/test-files/"
  "mustangproject|ZUGFeRD/mustangproject|68520f6e03cf1815eb5b22a4ad690d2ffc07eaed|/library/src/test/resources/"
  "xrechnung-testsuite|itplr-kosit/xrechnung-testsuite|1ce1dafffd035e5ce59a7ab0d3bf44ac14af16c9|/src/test/"
  "peppol-bis-invoice-3|OpenPEPPOL/peppol-bis-invoice-3|261c458474e27d58a25be629cccac28883171c92|/rules/"
  "France_RFE|fnfempe/France_RFE|97ba0f3d4ef2abed5780e9490d5c3a2be832ab1d|/FNFE_RFE_INVOICE/Z.example/"
)

for entry in "${corpora[@]}"; do
  IFS='|' read -r name repo sha patterns <<<"$entry"
  dir="$dest/$name"
  rm -rf "$dir"
  git init -q "$dir"
  git -C "$dir" remote add origin "https://github.com/$repo.git"
  git -C "$dir" config core.sparseCheckout true
  git -C "$dir" sparse-checkout init --no-cone
  # shellcheck disable=SC2086
  printf '%s\n' $patterns | git -C "$dir" sparse-checkout set --no-cone --stdin
  git -C "$dir" fetch -q --depth 1 --filter=blob:none origin "$sha"
  git -C "$dir" checkout -q FETCH_HEAD
  echo "$name $(git -C "$dir" rev-parse HEAD) $(find "$dir" -type f -not -path '*/.git/*' | wc -l) files"
done
