# Contributing

## How we work together

You write features. xdd reviews them. Everything goes through a PR.

Core updates from xdd come through upstream sync. Your `main` branch stays up to date without touching your feature work.

---

## Code

Your work lives in `features/` (per-request hooks) and `services/` (HTTP endpoints, callbacks, shared clients). Read [docs/framework.md](docs/framework.md) to understand how features, services, and hooks work.

`core/` is maintained by xdd and cannot be modified directly. If you need a change in `core/`, open an issue in [xe-works/xdd-smash](https://github.com/xe-works/xdd-smash/issues) describing your use case.

**Branch rules:**

- Never push directly to `main`
- One branch per feature or fix
- Open a PR when ready. At least one review before merge.

---

## Deployment

There are two hosting scenarios:

**xdd hosts.** xdd manages the infrastructure and is responsible for uptime. Deployment happens after code review. A PR is not deployed until it is approved. The specifics are agreed at contract time.

**You host.** You are responsible for infrastructure and deployments.

---

## Docs

| | |
|--|--|
| [docs/framework.md](docs/framework.md) | Hooks, injector, features |
| [docs/metrics.md](docs/metrics.md) | Prometheus, Grafana |
| [docs/deployment.md](docs/deployment.md) | Deploy to production |
