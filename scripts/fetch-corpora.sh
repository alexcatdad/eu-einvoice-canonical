#!/usr/bin/env bash
# Fetches the public sample corpora at pinned commits into test/corpus/repos/ (git-ignored).
# Only the folders that hold sample documents are checked out, with blobs fetched on demand,
# because phive-rules alone is over 3 GB with its rule sets.
#
# Bump a pin deliberately: the known-answer manifest test/corpus/expected.json lists files by
# path, so regenerate it with scripts/corpus-manifest.ts after moving one.
set -euo pipefail

dest="${1:-test/corpus/repos}"

# name | repository | pinned commit | sparse-checkout patterns (space separated)
corpora=(
  "phive-rules|phax/phive-rules|9ce8f8ca508468b7d937125c6aa0278f93b828c9|/*/src/test/resources/external/test-files/"
  "mustangproject|ZUGFeRD/mustangproject|32e59732f2846b7f2a22c08b515605c40938e95e|/library/src/test/resources/"
  "xrechnung-testsuite|itplr-kosit/xrechnung-testsuite|1ce1dafffd035e5ce59a7ab0d3bf44ac14af16c9|/src/test/"
  "peppol-bis-invoice-3|OpenPEPPOL/peppol-bis-invoice-3|5df0eff7c8efafd7c79c0dacce55082d175db759|/rules/"
  "France_RFE|fnfempe/France_RFE|97ba0f3d4ef2abed5780e9490d5c3a2be832ab1d|/FNFE_RFE_INVOICE/Z.example/"
  "en16931-examples|ConnectingEurope/eInvoicing-EN16931|b17b2695e5e3e021945c38658326b78a76f80f84|/test/ /ubl/examples/ /cii/examples/"
  "zugferd-corpus|ZUGFeRD/corpus|82e886fb21369e3e83c1e97170a4ff406deceee7|/PEPPOL/ /XML-Rechnung/ /ZUGFeRDv1/ /ZUGFeRDv2/ /fatturaPA/ /incoming/ /other/"
  "ksef-docs|CIRFMF/ksef-docs|ce3670ea042de380039de4c5849fd6455811b292|/faktury/"
  "ksef-client-java|CIRFMF/ksef-client-java|dc6cb26c3f879e69439230e930fe96efcf3c9c49|/demo-web-app/src/"
  "ksef-client-csharp|CIRFMF/ksef-client-csharp|a66cbc669814e6c2a615748a13a0a04a650ba04f|/KSeF.Client.Tests.Core/Templates/ /KSeF.Client.Tests/Templates/ /KSeF.DemoWebApp/"
  "satcfdi|SAT-CFDI/python-satcfdi|8d18244a34acf527cdfda778e96ef7d1ff62c7c6|/tests/"
  "cfdiutils|eclipxe13/CfdiUtils|f2a03dc254348a8fb9e50374ecdbe49e7dd43f9b|/tests/assets/"
  "odoo|odoo/odoo|c73240416f09b23b0ab9269ad17c52f295752797|/addons/l10n_*/tests/test_files/ /addons/l10n_*/tests/*_xmls/ /addons/l10n_*/tests/compliance/ /addons/l10n_account_edi_ubl_cii_tests/tests/test_files/"
  "oca-edi|OCA/edi|04ac1426b978b2533c0566da073ac13bde2f489c|/base_ubl_parse/tests/ /sale_order_import/tests/"
  "ph-ubl|phax/ph-ubl|c98245e3631c3914663ce4cb4162b8d26aad1c02|/ph-ubl-testfiles/ /ph-ublpe/src/test/ /ph-ubl-dian/src/test/"
  "ph-cii|phax/ph-cii|f0a234dbb324abb0cf10b6f587564f6797aea5b8|/ph-cii-testfiles/"
  "ph-ebinterface|phax/ph-ebinterface|3aad0f9c755d9b11cac24c083a6ff56104f48d38|/src/test/resources/"
  "ebinterface-ubl-mapping|austriapro/ebinterface-ubl-mapping|0248ff718c5c65fedbf1a9c70bd26dcdf13b7748|/src/test/resources/external/"
  "ebinterface-web|austriapro/ebinterface-web|04ca6d2a7711e95bd093fe69c64da0a3711ebe62|/ebinterface-web/src/test/resources/"
  "isdoc-pdf|isdoc/isdoc.pdf|96f73f653c0abe5719de51bce41065d70f1418c1|/examples/"
  "isdoc2ubl|isdoc/isdoc2ubl|4b64a8133036a9de2412e9e5571db29638e03be4|/test/"
  "facturae-examples|kreyo-io/facturae-examples|a98212adfdceeb5e50c706f4a7b3f26e10480775|/examples/"
  "zatca-php|Saleh7/php-zatca-xml|1fbff0921a7a3ddfa833ba0c5eecace881a515bb|/examples/"
  "gobl-cfdi|invopop/gobl.cfdi|ff537c9710956c245538768ad5987c023a945475|/test/data/"
  "gobl-cii|invopop/gobl.cii|3216642680e6ca6393964378de15583725c5a8aa|/test/data/"
  "gobl-facturae|invopop/gobl.facturae|b702b599515357b1b682756bc2f0cff9701ade90|/test/data/"
  "gobl-fatturapa|invopop/gobl.fatturapa|ab6bb846c17b8c878fb2d121a7dbcd2b771b10da|/test/data/"
  "gobl-finvoice|invopop/gobl.fi.finvoice|680d42eef7d5b3336b5eb7f8c1d80d4524fe89aa|/test/data/ /examples/"
  "gobl-ksef|invopop/gobl.ksef|b9a35907777a282f677e9728d54158d3be1152a6|/test/data/"
  "gobl-ubl|invopop/gobl.ubl|540f20165a79bc5a96d6209effae5020fe52a83a|/test/data/"
  "factur-x-py|akretion/factur-x|8a90b84f67b0eff6a3a8f41317c18451468fe2b9|/tests/fixtures/"
)

# A patterns list holds globs (odoo); keep the shell from expanding them against the working directory.
set -f

fetch_one() {
  local name="$1" repo="$2" sha="$3" patterns="$4" dir="$dest/$1"
  local remote="https://github.com/$repo.git"
  # Only reuse our own clone. Reapply the sparse patterns and discard local changes before every run.
  if [ ! -d "$dir/.git" ] || [ "$(git -C "$dir" config --get remote.origin.url 2>/dev/null)" != "$remote" ]; then
    rm -rf "$dir" || return 1
    git init -q "$dir" || return 1
    git -C "$dir" remote add origin "$remote" || return 1
  fi
  git -C "$dir" sparse-checkout init --no-cone || return 1
  # shellcheck disable=SC2086
  printf '%s\n' $patterns | git -C "$dir" sparse-checkout set --no-cone --stdin || return 1
  if ! git -C "$dir" cat-file -e "$sha^{commit}" 2>/dev/null; then
    git -C "$dir" -c http.lowSpeedLimit=1000 -c http.lowSpeedTime=30 fetch -q --depth 1 --filter=blob:none origin "$sha" || return 1
  fi
  git -C "$dir" reset --hard -q "$sha" || return 1
  git -C "$dir" clean -ffdx -q || return 1
  [ "$(git -C "$dir" rev-parse HEAD)" = "$sha" ] || return 1
}

main() {
  local jobs="${CORPUS_FETCH_JOBS:-4}" logs failed=0 index=0 i name repo sha patterns
  case "$jobs" in 1|2|3|4|5|6|7|8) ;; *) echo 'CORPUS_FETCH_JOBS must be an integer between 1 and 8' >&2; return 1 ;; esac
  mkdir -p "$dest"
  logs="$(mktemp -d)"
  trap 'rm -rf "$logs"' EXIT
  local pids=()
  for entry in "${corpora[@]}"; do
    IFS='|' read -r name repo sha patterns <<<"$entry"
    (
      # A failure remains visible but must not take the other corpora down.
      if fetch_one "$name" "$repo" "$sha" "$patterns"; then
        echo "$name $sha $(find "$dest/$name" -type f -not -path '*/.git/*' | wc -l) files"
      else
        echo "$name $sha FETCH FAILED"
        rm -rf "${dest:?}/${name:?}"
        exit 1
      fi
    ) > "$logs/$index.out" 2> "$logs/$index.err" &
    pids+=("$!")
    index=$((index + 1))
    if [ "${#pids[@]}" -ge "$jobs" ]; then
      for pid in "${pids[@]}"; do wait "$pid" || failed=$((failed + 1)); done
      pids=()
    fi
  done
  for pid in "${pids[@]}"; do wait "$pid" || failed=$((failed + 1)); done
  # Keep pin-report ordering stable regardless of completion order.
  for ((i=0; i<index; i++)); do cat "$logs/$i.out"; cat "$logs/$i.err" >&2; done
  rm -rf "$logs"
  trap - EXIT
  [ "$failed" -eq 0 ] || echo "WARNING: $failed corpora could not be fetched" >&2
}

if [ "${BASH_SOURCE[0]}" = "$0" ]; then main; fi
