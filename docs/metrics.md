# Prometheus metrics

xdd-smash exposes a `/metrics` endpoint in the Prometheus text format.
All timings are in **milliseconds**.

## Endpoint

```
GET /metrics
```

Same port as the main bidder. If `metricsToken` is set in `config.json`, the endpoint requires a bearer token:

```
Authorization: Bearer <token>
```

Without a token the endpoint is open — always set `metricsToken` in production.

## Built-in metrics

| Metric | Type | Labels | Description |
|---|---|---|---|
| `smash_requests_total` | counter | `endpoint_id`, `outcome` | Total requests processed |
| `smash_request_duration_milliseconds` | histogram | `endpoint_id` | Full pipeline duration |
| `smash_dsp_latency_milliseconds` | histogram | `endpoint_id`, `dsp_status` | DSP HTTP call duration |
| `smash_blocks_total` | counter | `endpoint_id`, `blocked_by` | Requests blocked by a pipeline stage |

**`outcome`** values: `bid` · `nobid` · `blocked` · `error`

**`dsp_status`** values: `ok` · `timeout` · `error`

**`blocked_by`** values: pipeline stage name (`prebid-ssp`, `prebid-dsp`, `postbid-dsp`, `postbid-ssp`) or `tmax`

## Prometheus scrape config

```yaml
scrape_configs:
  - job_name: xdd-smash
    static_configs:
      - targets:
          - <worker-host>:3001
          - <worker-host-2>:3001
    metrics_path: /metrics
    scrape_interval: 15s
    authorization:
      credentials: <metricsToken from config.json>
```

For multi-worker deployments add all worker hosts. Labels `instance` and `job` are added automatically by Prometheus.

## Grafana queries

**Request rate (RPS):**
```promql
sum(rate(smash_requests_total[1m])) by (endpoint_id)
```

**Bid rate (%):**
```promql
sum(rate(smash_requests_total{outcome="bid"}[5m])) by (endpoint_id)
/
sum(rate(smash_requests_total[5m])) by (endpoint_id)
* 100
```

**p95 pipeline latency:**
```promql
histogram_quantile(0.95, sum(rate(smash_request_duration_milliseconds_bucket[5m])) by (le, endpoint_id))
```

**p95 DSP latency:**
```promql
histogram_quantile(0.95, sum(rate(smash_dsp_latency_milliseconds_bucket[5m])) by (le, endpoint_id))
```

**Block rate by stage:**
```promql
sum(rate(smash_blocks_total[5m])) by (endpoint_id, blocked_by)
```

## Adding custom metrics in a fork

Use `defineCounter` / `defineHistogram` from `core/metrics.js`. Both register into the same Prometheus registry, so custom metrics appear on the same `/metrics` endpoint.

```js
import { defineCounter, defineHistogram } from '../../core/metrics.js';

// Define at module level — never inside a function (causes duplicate registration errors)
const myEventsTotal = defineCounter(
  'smash_myfeature_events_total',
  'Events processed by my feature',
  ['endpoint_id', 'result'],
);

const myLatency = defineHistogram(
  'smash_myfeature_duration_milliseconds',
  'My feature processing time in ms',
  ['endpoint_id'],
  [1, 5, 10, 25, 50],  // optional custom buckets
);

// In your hook:
export default async function myFeatureHook(ctx) {
  const start = Date.now();
  // ... logic ...
  myEventsTotal.inc({ endpoint_id: ctx.dsp.endpointId ?? 'unknown', result: 'ok' });
  myLatency.observe({ endpoint_id: ctx.dsp.endpointId ?? 'unknown' }, Date.now() - start);
  return ctx;
}
```

Use the `smash_` prefix for all custom metrics to keep the namespace consistent.
