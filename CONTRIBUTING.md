# Contributing

Thanks for helping. This project is licensed under [0BSD](LICENSE); by contributing you agree your contribution is released under the same licence. Please follow the [Code of Conduct](CODE_OF_CONDUCT.md). To report a vulnerability, use [SECURITY.md](SECURITY.md), not a public issue.

## Setup

You need [Bun](https://bun.sh) 1.4 or newer. Node is not required.

```bash
bun install --frozen-lockfile
```

## Tests run in CI

Tests, coverage, the conformance checklist, the performance gate, Docker and CodeQL all run in GitHub Actions on every pull request. Open the PR and read the checks; you are not expected to run the full suite locally. A PR merges only when the required checks (`test`, `docker`, CodeQL) are green.

## Local checks

Run these before pushing. Everything goes through `bun`:

```bash
bun run typecheck                                              # tsc --noEmit
bun ./node_modules/@biomejs/biome/bin/biome check --write .    # Biome lint + format (same as `bun run format`)
bun run check:schemas                                          # JSON Schemas match src/canonical.ts
```

CI runs `bun run lint:ci`, which fails on any formatting or lint difference.

## Adding a format

1. Register it in `src/formats.ts` (id, detection rule, parser family, countries, status).
2. Write the parser in `src/parsers/` and add it to the family registry in `src/parsers/index.ts`. Reuse the helpers in `context.ts`, record field provenance, and keep every amount an exact decimal string (see `src/values.ts`).
3. Add a fixture under `test/fixtures/` and list its expected format in `test/fixtures/expected.json`. Describe it, with its provenance and licence, in `test/fixtures/README.md`.
4. Add a test in `test/` with field-by-field assertions.
5. Add an entry for the format in `conformance/notes.json` (mapping source; `publicSamples` only for real public samples listed in the fixtures README).
6. Add or update the format's section in `README.md` (what is mapped, what is not).
7. If the canonical model changed, regenerate the schemas (below).

## Fixtures and licensing

The rules are in [test/fixtures/README.md](test/fixtures/README.md). In short:

- Prefer synthetic documents with fictitious parties and consistent totals.
- Never commit a real invoice or any real personal data (names, addresses, VAT or tax numbers of real persons, IBANs, e-mail addresses).
- Copy a public sample only if the hosting repository's licence allows redistribution. Copy it byte for byte, and record the source, commit and licence in the README table. If no licence can be found, do not commit it.
- Do not "tidy" fixtures. Line endings, BOMs and legacy encodings (for example ISO-8859-1) are part of what is tested; `.gitattributes` keeps git from normalising them.

## Regenerating schemas

`schemas/*.json` are generated from `src/canonical.ts`. After changing the canonical types:

```bash
bun run build:schemas
```

Commit the result. CI fails when the files are stale. Do not edit them by hand.

## Commits and pull requests

- Branch from `main`; keep one logical change per PR.
- Use [Conventional Commits](https://www.conventionalcommits.org/) for the PR title. PRs are squash-merged, so the title becomes the commit message: `feat: add X parser`, `fix(ubl): handle empty InvoiceLine`, `docs:`, `test:`, `chore:`, `ci:`, `refactor:`, `perf:`. Mark breaking changes with `!` or a `BREAKING CHANGE:` footer. This is a convention, not a required check.
- Explain the why in the description and fill in the checklist in the PR template.
- User-visible changes get a line under `Unreleased` in [CHANGELOG.md](CHANGELOG.md).
- Address review comments with follow-up commits; maintainers squash on merge.
## Private qualification cache

Library and website CI can reuse verified qualification bundles from the private
`alexcatdad/eu-einvoice-validation-cache` repository. `VALIDATION_CACHE_SSH_KEY` is
a read-only deploy key for that repository, stored as an Actions secret. It is
not available to fork PRs, which retain the normal pinned acquisition path.

Cache keys include source pins, build recipes, dependency locks, compiler runtimes,
and licensing/distribution policy. Cache hits verify the archive and every bundled
file, source pin and inventory; corruption fails the job. Cache misses acquire the
pinned sources normally. All existing qualification and distribution gates still run.

The private repository rebuilds and qualifies pinned sources weekly, Mondays at
02:47 UTC, before updating its cache. Changed upstream hashes fail verification;
new versions or licensing decisions require a reviewed source-repository change.
Unchanged keys retain the verified archive to avoid unnecessary binary Git history.
The private checkout is removed before other builds and excluded from Git/Docker.
Redistribution-excluded bundles never enter public Actions caches or release assets.
