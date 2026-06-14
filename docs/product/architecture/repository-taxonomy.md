# Repository Taxonomy

SignalOps is a polyglot pnpm monorepo. The repository shape is part of the runtime contract: source, tests, proof harnesses, fixtures and generated artifacts must stay separated so production images and operator proof lanes remain understandable.

## Canonical Directories

| Directory | Role |
| --- | --- |
| `runtime/node/apps/**/src` | Web/admin Astro runtime source and BFF boundaries. |
| `runtime/node/packages/**/src` | Shared product packages and contracts. |
| `runtime/node/services/**/src` | Node runtime service code. |
| `runtime/python/src/signalops/**` | Python API, worker, ML and indexer runtime code. |
| `tests/unit/{ts,python}` | Deterministic unit and regression tests. |
| `tests/integration` | Bounded multi-module tests. |
| `tests/e2e` | Browser-facing user/operator tests. |
| `infra/scripts/checks` | Static repository, compliance, security and artifact guards. |
| `infra/scripts/proof` | Product, compose, browser and operator proof harness entrypoints. |
| `infra/scripts/ops` | Operator ops entrypoints. |
| `infra/scripts/release` | Release verification entrypoints. |
| `infra/scripts/lib` | Shared proof/check libraries. |
| `infra/scripts/{fetchers,relay,workers}` | Service-specific smoke helpers used by package scripts or compose proof. |
| `infra/fixtures` | Test/proof fixtures only. |
| `docs/archive`, `docs/product/operator/old_examples` | Historical material; not active acceptance path. |

## Generated And Runtime State

Build outputs are generated under ignored `build/**`. Package-local `dist/**` is not an active runtime contract. Astro type/cache state (`.astro`), coverage, Playwright reports, caches and `data/{models,indices,snapshots,logs}` payloads are ignored/generated. Only small marker/readme files under `data/**` may be tracked.

## Guards

- `pnpm check:repo-taxonomy` verifies production source cleanliness, generated-artifact exclusion, script taxonomy, old runtime-root exclusion and active references to moved script entrypoints.
- `pnpm check:test-layout` remains the narrow compatibility guard for test/proof/fixture files inside production source trees.
- `pnpm check:runtime-artifacts` and `pnpm check:production-image-contents` verify production Docker/runtime images do not include tests, proof harnesses, fixtures, AIDP state, env files or derived data payloads.

Root command names are the public interface. Internal script paths may move only when `package.json`, active docs and tests move together.
