# ab-testing

Splits traffic into variants and changes behaviour per request through **config
overrides**, so a feature needs no A/B awareness of its own.

- Stage: `prebid-ssp` (runs first, before anything reads config)
- Namespace: `abTesting`

A variant's `config` patch lands in `ctx.configOverrides`, which `resolveConfig`
overlays for the target namespace. The assignment rides into the tracking token,
so impressions can be attributed back to a variant.

`bucketBy` takes one dot-path or a list; a list is joined so the bucket is stable
for that combination. Metrics are declared per measurement point via `metrics[].on`.
