# Canonical line annotations

See the [consumer guide](../../docs/LINE-ANNOTATIONS.md) for setup, the canonical input, annotation meanings and supported scope.

Run the saved synthetic example from the repository root:

```sh
bun install
go -C examples/line-annotations/hujson mod download
bun examples/line-annotations/run.ts
```

The default run makes no model request. Use the guide for the explicit `--send` option.
