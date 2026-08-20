# xdd-smash

Own your RTB stack.

Vendors sell white-label: your logo, their black box, their roadmap. You cannot read the code, so you cannot verify what happens to your requests — and when something is wrong, the consequences land on you, not on them. Their complexity is not an accident either. The harder the stack is to understand, the harder you are to replace.

xdd-smash is the other option. An open framework you run yourself, plus a private copy of the repository, code review, and consulting from the people who wrote it. Cheaper than renting a platform, and nothing waits on someone else's roadmap.

**One developer is enough to run it.** That is why simplicity matters here: independence you cannot staff is not independence.

Trust in programmatic cannot be audited from the outside — you see what you sent, not what was forwarded. It stops being a problem when every participant runs their own stack. That is why this is open.

---

## What it is

A proxy RTB bidder. It sits between your ad management platform and your demand, runs a pipeline on every bid request, and returns the result.

```
SSP / SDK / etc -> Ad management platform (e.g. XE) -> xdd-smash -> DSP / demand
```

It ships integrated with XE, an ad management platform, which brings ready-made features that are not part of the core. The core is a general framework: write features as hooks, drop a folder, and it is picked up at startup. There is no central file to edit.

---

## Getting started

Not written yet. Getting from a clone to a bid response should take minutes, and today it does not — see [#6](https://github.com/xe-works/xdd-smash-open/issues/6). Help is welcome there; it is the first thing anyone tries.

Node 22 or newer, and the reference for the request shape is [docs/framework.md](docs/framework.md).

---

## For developers

The building block is a **hook**: a function that receives the request context and either returns it to continue, or returns `null` for a no-bid.

```js
export default function(ctx) {
  return ctx;   // continue
  return null;  // no-bid
}
```

A **feature** is one or more hooks in a folder. Two kinds, and the difference is about failure:

- **Stateless** — no external dependencies, so there is little to fail.
- **Stateful** — depends on Redis, a database, something over the network. Must be fail-open: if the dependency is unreachable, return `ctx` untouched. A bid is never lost to infrastructure.

Fail-open is on you, not on the framework. A hook that throws is recorded and the request is dropped, so catch what you expect to fail and return `ctx` instead. Nothing is swallowed for you.

### Docs

- [docs/framework.md](docs/framework.md) — hooks, the injector, building features
- [docs/metrics.md](docs/metrics.md) — Prometheus, Grafana
- [docs/deployment.md](docs/deployment.md) — deploying to production
- [CONTRIBUTING.md](CONTRIBUTING.md) — how to contribute, and how review works

Questions and bug reports: [open an issue](https://github.com/xe-works/xdd-smash-open/issues).

## License

[Apache 2.0](LICENSE). The framework is open; feature modules, deployments/hosting and support are offered separately.
