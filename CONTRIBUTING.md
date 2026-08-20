# Contributing

Everything goes through a pull request, and every pull request needs at least
one review before it merges. That applies to us as much as to you.

## Getting set up

```bash
npm ci
npm test
npm run lint
npm run coverage   # tests again, with thresholds
```

Node 22 or newer. `package.json` still says `>=20`, but the test script hands
glob patterns to `node --test` and those are only expanded from Node 21 on.

## Where code goes

| | |
|--|--|
| `features/` | per-request hooks — the pipeline |
| `services/` | HTTP endpoints, callbacks, long-lived clients |
| `core/` | maintained by xdd, see below |

Read [docs/framework.md](docs/framework.md) first. It explains hooks, the
injector and how a feature registers itself. Adding a feature is dropping a
directory with an `index.js` that exports `register`; nothing central needs
editing, which is the point.

`core/` is maintained by xdd and pull requests from forks that touch it are
rejected automatically. If you need something from core, open an issue
describing the use case and we will either integrate it or point you at the
seam that already does the job. This is not gatekeeping for its own sake: every
client fork inherits core, so a change there lands on all of them.

## Pull requests

- One branch per change, never push to `main` directly.
- Tests and lint run on every PR and must pass.
- Cover behaviour you add, and behaviour you fix. If a bug reached `main` once,
  a test is the only thing stopping it reaching `main` twice. Coverage has a
  floor and CI enforces it; the floor exists to stop erosion, not as a target.
- Say what changed and why in the description. The diff shows what; only you
  know why.
- At least one review before merge.

## Licensing of contributions

The project is [Apache 2.0](LICENSE). By opening a pull request you certify that
you wrote the change or otherwise have the right to submit it under that
licence, and that you are willing for it to be distributed under it.

## Security

Do not open a public issue for a vulnerability. See
[SECURITY.md](SECURITY.md).

---

## For clients running xdd-smash

The sections above apply to you too. What follows is specific to a contract
with xdd.

Core updates reach your fork through upstream sync, so your `main` stays
current without touching your feature work.

There are two hosting arrangements. If **xdd hosts**, we manage the
infrastructure and own uptime; deployment follows review, and a PR is not
deployed until it is approved. If **you host**, infrastructure and deployments
are yours. Which one applies is agreed at contract time.

| | |
|--|--|
| [docs/framework.md](docs/framework.md) | Hooks, injector, features |
| [docs/metrics.md](docs/metrics.md) | Prometheus, Grafana |
| [docs/deployment.md](docs/deployment.md) | Deploy to production |
