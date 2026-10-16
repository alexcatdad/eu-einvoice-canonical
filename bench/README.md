# Benchmarks

```
bun run bench          # everything -> bench/results.json, bench/results.md (about 2 minutes)
bun run bench:check    # the CI gate: quick subset vs bench/baseline.json (needs `bun run build:site` for the bundle sizes)
bun bench/run.ts --quick --update-baseline   # refresh the baseline
```

- **Cases** (`cases.ts`): every fixture, every envelope wrapper, the optional layers (relations, provenance, validate), generated
  invoices of 1,000 and 10,000 lines and one with a 20 MB attachment (written to `bench/.cache/` once). Throughput is documents per
  second; peak memory is the resident set of a fresh process that converts the case once.
- **Gate**: times are divided by a calibration loop measured in the same run, and the ratio is compared with the baseline's. A case fails
  above 2x slower; a browser chunk fails above 15% larger. The job summary lists every delta. If CI's hardware differs a lot from the
  machine that made the baseline, refresh it from the `bench-quick` artifact of a green run (`last-quick.json` is the same format).
- `results.json` feeds the "Performance" section of the conformance page (`scripts/conformance.ts`).
