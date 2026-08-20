# xdd-smash

A framework for building RTB bidding platforms.

xdd-smash is a proxy RTB bidder. It sits between XE and DSPs, runs a pipeline on every bid request, and returns the result to XE.

```
SSP -> XE -> xdd-smash -> DSP
```

XE is a set of features that let you go live from day one. It is not a dependency. It is the business framework around xdd-smash — features you can gradually build into your own platform or replace with your own implementations together with xdd.

---

## The model

Everything you build in xdd-smash is a feature. A feature is one or more hooks registered into the pipeline.

A hook is the key pattern for writing anything in this framework:

```js
export default function(ctx) {
  return ctx;   // continue
  return null;  // no-bid
}
```

The pipeline runs your hooks at the right stage. You control when a hook fires by where you put the file and what you name it.

Features come in two kinds:

**Stateless.** Enriches or filters requests with no external dependencies. Errors are swallowed. The bid always continues.

**Stateful.** Depends on external state like Redis or a database. Must be fail-open: if the external service is unreachable, the hook returns `ctx`. A bid is never blocked because of infrastructure.

Beyond hooks, **services** handle what does not fit a per-request model — HTTP endpoints, callbacks, shared clients. They live in `services/`, register by name, and bind to HTTP routes. Features and services are both auto-loaded from their directories, so adding either is dropping a folder.

Read [docs/framework.md](docs/framework.md) for the full guide on hooks, the injector, services, and building features.

---

## Getting started

```bash
cp config.example.json config.json
node index.js    # run locally
npm test         # run tests
```

---

## Docs

| | |
|--|--|
| [CONTRIBUTING.md](CONTRIBUTING.md) | Branch rules, what you can change |
| [docs/framework.md](docs/framework.md) | Hooks, injector, features |
| [docs/metrics.md](docs/metrics.md) | Prometheus, Grafana |
| [docs/deployment.md](docs/deployment.md) | Deploy to production |

## License

[Apache 2.0](LICENSE). The framework is open; feature modules and support are offered separately.
