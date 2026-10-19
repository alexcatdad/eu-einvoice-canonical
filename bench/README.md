# Benchmarks

```
bun run bench          # everything -> bench/results.json, bench/results.md (about 2 minutes)
bun run bench:check    # the CI gate: quick subset vs bench/baseline.json (needs `bun run build:site` for the bundle sizes)
bun bench/run.ts --quick --update-baseline   # refresh the baseline
```

- **Cases** (`cases.ts`): every fixture, every envelope wrapper, the optional layers (relations, provenance, validate), generated
  invoices of 1,000 and 10,000 lines and one with a 20 MB attachment (written to `bench/.cache/` once). Throughput is documents per
  second; peak memory is the resident set of a fresh process that converts the case once.
- **Gate**: times are divided by a calibration loop measured in the same run, and the ratio is compared with the baseline's; because other hardware shifts all ratios together, each case is then judged against the median shift. A case fails
  above 2x slower; a browser chunk fails above 15% larger. The job summary lists every delta. If CI's hardware differs a lot from the
  machine that made the baseline, refresh it from the `bench-quick` artifact of a green run (`last-quick.json` is the same format).
- `results.json` feeds the "Performance" section of the conformance page (`scripts/conformance.ts`).

## v2 dependency-boundary checkpoint

The optional entry points change how Bun partitions shared chunks. The bundle portion of `baseline.json` was refreshed after this change; timing cases and the 2x slowdown / 15% growth thresholds are unchanged. Compared with commit `e9215be` on the same macOS arm64 host using Bun 1.4.3:

| Measurement | Before | After |
| --- | ---: | ---: |
| Core browser build, all chunks (minified bytes) | 1,399,611 | 1,257,225 |
| Core browser build, summed gzip bytes | 452,659 | 405,880 |
| Site JavaScript, entries and chunks (minified bytes) | 1,543,965 | 1,518,783 |
| Site JavaScript, summed gzip bytes | 510,241 | 502,147 |
| Bun production install with peers omitted (packages) | 123 | 45 |
| Installed node_modules (KiB, filesystem allocation) | 64,788 | 38,844 |

Core builds use `bun build src/index.ts --target=browser --minify --splitting --outdir=<temp>`; site sizes use `bundleSizes()` after `build:site`, excluding documentation assets and source maps. Dependencies use fresh directories and `bun install --production --omit peer --frozen-lockfile --ignore-scripts`. Default Bun production installs still auto-install peers. These measurements are local comparisons, not browser first-load transfer or remote CI results.
