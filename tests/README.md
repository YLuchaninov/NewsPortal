# Test layout

SignalOps uses three explicit test layers:

- `unit/` contains deterministic local unit and regression tests. These tests must not require Docker, live provider credentials, external network calls, or production state.
- `integration/` is reserved for bounded multi-module tests that need local services or durable fixture setup.
- `e2e/` is reserved for browser-facing user and operator flows.

Product proof and operator smoke harness entrypoints stay in `infra/scripts/proof/`. Shared helpers stay in `infra/scripts/lib/`, static guards in `infra/scripts/checks/`, and service-specific smoke helpers in `infra/scripts/{fetchers,relay,workers}/`. Proof harnesses can orchestrate compose/runtime state, but they should not hide ordinary unit, integration, or browser test cases.
