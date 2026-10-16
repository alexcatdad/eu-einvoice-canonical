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
  "en16931-examples|ConnectingEurope/eInvoicing-EN16931|6e35e0ab8b09eb183f7d84b282e24ef95f9f5715|/test/ /ubl/examples/ /cii/examples/"
  "zugferd-corpus|ZUGFeRD/corpus|82e886fb21369e3e83c1e97170a4ff406deceee7|/PEPPOL/ /XML-Rechnung/ /ZUGFeRDv1/ /ZUGFeRDv2/ /fatturaPA/ /incoming/ /other/"
  "ksef-docs|CIRFMF/ksef-docs|ce3670ea042de380039de4c5849fd6455811b292|/faktury/"
  "ksef-client-java|CIRFMF/ksef-client-java|dc6cb26c3f879e69439230e930fe96efcf3c9c49|/demo-web-app/src/"
  "ksef-client-csharp|CIRFMF/ksef-client-csharp|a66cbc669814e6c2a615748a13a0a04a650ba04f|/KSeF.Client.Tests.Core/Templates/ /KSeF.Client.Tests/Templates/ /KSeF.DemoWebApp/"
  "satcfdi|SAT-CFDI/python-satcfdi|4150b970a42da47b88fd5fc53edb8585c47092fd|/tests/"
  "cfdiutils|eclipxe13/CfdiUtils|f2a03dc254348a8fb9e50374ecdbe49e7dd43f9b|/tests/assets/"
  "odoo|odoo/odoo|44675b570a015f69c46f4b7c29f91a7d1fcfb6f5|/addons/l10n_*/tests/test_files/ /addons/l10n_*/tests/*_xmls/ /addons/l10n_*/tests/compliance/ /addons/l10n_account_edi_ubl_cii_tests/tests/test_files/"
  "oca-edi|OCA/edi|913990dbbaa27b47901c1e43d7d60fe6de78b36a|/base_ubl_parse/tests/ /sale_order_import/tests/"
  "ph-ubl|phax/ph-ubl|06c0ea37169703bc512217125d7b0991264cd719|/ph-ubl-testfiles/ /ph-ublpe/src/test/ /ph-ubl-dian/src/test/"
  "ph-cii|phax/ph-cii|d367ec9dfc5248e423cdbb1b245e4b026f3a3756|/ph-cii-testfiles/"
  "ph-ebinterface|phax/ph-ebinterface|ec8d3c842c893812dd488db7bf8ff8fc450600d9|/src/test/resources/"
  "ebinterface-ubl-mapping|austriapro/ebinterface-ubl-mapping|9d20ed9f24c4820fe1fe3dfdfc6b53c91efdf98d|/src/test/resources/external/"
  "ebinterface-web|austriapro/ebinterface-web|04ca6d2a7711e95bd093fe69c64da0a3711ebe62|/ebinterface-web/src/test/resources/"
  "isdoc-pdf|isdoc/isdoc.pdf|96f73f653c0abe5719de51bce41065d70f1418c1|/examples/"
  "isdoc2ubl|isdoc/isdoc2ubl|4b64a8133036a9de2412e9e5571db29638e03be4|/test/"
  "facturae-examples|kreyo-io/facturae-examples|a98212adfdceeb5e50c706f4a7b3f26e10480775|/examples/"
  "zatca-php|Saleh7/php-zatca-xml|1fbff0921a7a3ddfa833ba0c5eecace881a515bb|/examples/"
  "gobl-cfdi|invopop/gobl.cfdi|ff537c9710956c245538768ad5987c023a945475|/test/data/"
  "gobl-cii|invopop/gobl.cii|8368fb32de32b1c7ac388c84366548a6344b693a|/test/data/"
  "gobl-facturae|invopop/gobl.facturae|d77fc8abaa1318020ab912ef0ffcc21277f645cb|/test/data/"
  "gobl-fatturapa|invopop/gobl.fatturapa|809f8e3a587a60d1c662442298de6bb542c32f20|/test/data/"
  "gobl-finvoice|invopop/gobl.fi.finvoice|680d42eef7d5b3336b5eb7f8c1d80d4524fe89aa|/test/data/ /examples/"
  "gobl-ksef|invopop/gobl.ksef|578c707667125029ed33349b14a0dd4c5ed84f1b|/test/data/"
  "gobl-ubl|invopop/gobl.ubl|df5c69bd26bb27cdcce4a1003916d9f10079bebf|/test/data/"
  "factur-x-py|akretion/factur-x|04ea93958dbfe5c8ef09c1166249d0fc7a59efd8|/tests/fixtures/"
)

# A patterns list holds globs (odoo); keep the shell from expanding them against the working directory.
set -f

fetch_one() {
  local name="$1" repo="$2" sha="$3" patterns="$4" dir="$dest/$1"
  rm -rf "$dir"
  git init -q "$dir"
  git -C "$dir" remote add origin "https://github.com/$repo.git"
  git -C "$dir" config core.sparseCheckout true
  git -C "$dir" sparse-checkout init --no-cone
  # shellcheck disable=SC2086
  printf '%s\n' $patterns | git -C "$dir" sparse-checkout set --no-cone --stdin
  git -C "$dir" fetch -q --depth 1 --filter=blob:none origin "$sha"
  git -C "$dir" checkout -q FETCH_HEAD
}

failed=0
for entry in "${corpora[@]}"; do
  IFS='|' read -r name repo sha patterns <<<"$entry"
  # One unreachable repository must not take the others down: report it and go on.
  if (fetch_one "$name" "$repo" "$sha" "$patterns"); then
    dir="$dest/$name"
    echo "$name $(git -C "$dir" rev-parse HEAD) $(find "$dir" -type f -not -path '*/.git/*' | wc -l) files"
  else
    echo "$name $sha FETCH FAILED"
    rm -rf "$dest/$name"
    failed=$((failed + 1))
  fi
done
[ "$failed" -eq 0 ] || echo "WARNING: $failed corpora could not be fetched" >&2
