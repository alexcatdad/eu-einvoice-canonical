# Supply chain

What protects releases and CI, how to verify a download, and the repository settings the owner should apply (these are deliberately not changed from workflows or pull requests). Nothing is published to npm.

## In place

- **Pinned actions.** Every third-party GitHub Action is pinned to a full commit SHA with a version comment. Dependabot (`.github/dependabot.yml`) proposes updates weekly, grouped, for GitHub Actions, npm (root and `site/`; Dependabot maintains `bun.lock` through the npm ecosystem) and the Docker base image.
- **Least privilege.** Each workflow starts from `permissions: {}` and each job declares only what it needs. Checkouts use `persist-credentials: false` except in the two workflows that push a branch (`corpus-pins.yml`, `trust-lists.yml`).
- **Frozen installs.** Workflows use `bun install --frozen-lockfile`; Bun and the base image are pinned to 1.4.2.
- **Release artifacts** (`release.yml`, on `v*` tags):
  - the Linux, macOS (arm64) and Windows binaries,
  - `einvoice-validation-assets.tar.gz`, the portable local XSD/WASM and isolated Schematron worker with pinned rule bundles and notices,
  - `SHA256SUMS` covering the binaries, validation assets and the SBOM,
  - `einvoice-sbom.cdx.json`, a CycloneDX SBOM generated with Anchore's `sbom-action` (Syft),
  - signed SLSA build provenance attestations (`actions/attest-build-provenance`, Sigstore) for every binary, validation assets, the SBOM and `SHA256SUMS`.
- **OpenSSF Scorecard** (`scorecard.yml`): weekly and on pushes to `main`, results go to code scanning (SARIF) and to the public Scorecard API for the README badge.
- **Vulnerability reporting policy:** `SECURITY.md`.

## Verify a release download

Install the [GitHub CLI](https://cli.github.com/), download an asset and check it. The attestation proves the file was built by this repository's `release.yml` workflow from a tagged commit.

```sh
TAG=v1.2.0
gh release download "$TAG" -R alexcatdad/eu-einvoice-canonical -p 'einvoice-linux-x64' -p 'einvoice-validation-assets.tar.gz' -p 'SHA256SUMS' -p 'einvoice-sbom.cdx.json'

# 1. Provenance: signed by this repository's release workflow
gh attestation verify einvoice-linux-x64 -R alexcatdad/eu-einvoice-canonical \
  --signer-workflow alexcatdad/eu-einvoice-canonical/.github/workflows/release.yml

gh attestation verify einvoice-validation-assets.tar.gz -R alexcatdad/eu-einvoice-canonical \
  --signer-workflow alexcatdad/eu-einvoice-canonical/.github/workflows/release.yml

# 2. Checksum (Linux: sha256sum; macOS: shasum -a 256)
sha256sum --ignore-missing -c SHA256SUMS

# 3. Keep the offline assets beside the executable
tar -xzf einvoice-validation-assets.tar.gz
chmod +x einvoice-linux-x64
./einvoice-linux-x64 convert --validate invoice.xml

# Optional: the checksum list and SBOM are attested too
gh attestation verify SHA256SUMS -R alexcatdad/eu-einvoice-canonical
gh attestation verify einvoice-sbom.cdx.json -R alexcatdad/eu-einvoice-canonical
```

The archive creates `validation/`, `runtime/` and `node_modules/xmllint-wasm/` beside the executable. Keep these directories together when moving the installation. Missing or corrupt required assets make requested validation incomplete (CLI exit 6). Plain conversion remains available.

A successful `gh attestation verify` prints the matched workflow and commit; any failure means do not run the file. The SBOM is CycloneDX JSON and can be fed to tools such as `grype` or `osv-scanner`.

## Recommended repository settings (owner action)

Settings are not changed by this repository's automation. Suggested, under Settings:

1. **Code security > Private vulnerability reporting: on.** `SECURITY.md` points reporters at it.
2. **Dependabot alerts: on; Dependabot security updates: on.** (Version updates come from `dependabot.yml`.)
3. **Code scanning with CodeQL (default setup, JavaScript/TypeScript and Actions): on**, and add it as a **required** code scanning result in the `main` ruleset (Settings > Rules > Rulesets > Require code scanning results > CodeQL).
4. **Ruleset for `main`:** require a pull request, require the `test` status check (and `docker`), block force pushes and deletion. Optionally require signed commits; this is a trade-off for a single maintainer, so it is optional.
5. **Tag ruleset for `v*`:** restrict creation and block deletion or updates, since tags trigger releases.
6. **Actions settings:** default workflow token permission "Read repository contents"; "Require approval for first-time contributors" or stricter for fork pull requests; optionally allow only actions pinned by SHA ("Require actions to be pinned to a full-length commit SHA").
7. **Secret scanning and push protection: on.**
8. **Immutable releases: on**, if available, so published release assets cannot be swapped.
9. Optionally protect a `release` environment with required reviewers and move the release job into it.

## Not covered

- Provenance and SBOM cover the release binaries and their shipped validation assets; the Docker image is built in CI for testing and is not published.
- Dependencies are pinned by `bun.lock` (integrity hashes) but not individually audited; the SBOM lists them.
