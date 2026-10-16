## What and why

<!-- One or two sentences. The PR title should follow Conventional Commits (feat:, fix:, docs:, ...). -->

## Checklist

- [ ] Tests added or updated (they run in CI; no need to run the full suite locally)
- [ ] `bun run typecheck` and Biome (`bun ./node_modules/@biomejs/biome/bin/biome check --write .`) pass locally
- [ ] Schemas regenerated (`bun run build:schemas`) if `src/canonical.ts` changed
- [ ] README and `conformance/notes.json` updated if a format or its coverage changed
- [ ] `CHANGELOG.md` has a line under Unreleased for user-visible changes
- [ ] No real personal data in fixtures; new fixtures are documented with their licence in `test/fixtures/README.md`
