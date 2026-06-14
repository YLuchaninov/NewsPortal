# Documentation Inventory

Last synchronized: 2026-06-10.

This inventory classifies repository documentation after the Discovery vNext, task-plugin, MCP and ingress-adapter documentation sync. Code, migrations, package scripts and `.aidp/*` owner files remain higher authority than human docs.

## Active Product And Architecture Docs

| Path | Classification | Notes |
| --- | --- | --- |
| `README.md` | root product/runtime overview | Entry point for repository shape, runtime commands and current Discovery vNext runbook. |
| `docs/product/README.md` | product docs index | Human-facing navigation. |
| `docs/product/architecture/architecture-overview.md` | architecture overview | Compact system map and current boundaries. |
| `docs/product/architecture/product-blueprint.md` | product architecture truth | Explains durable product decisions without replacing `.aidp/blueprint.md`. |
| `docs/product/architecture/repository-taxonomy.md` | repository structure contract | Human-facing source/test/proof/infra/generated artifact taxonomy. |
| `docs/product/architecture/nonstandard-technical-decisions.md` | research/decision note | External analogs and rationale for non-standard local decisions, including explicit/hidden/mixed signal lanes. |
| `docs/discovery_vnext_blueprint.md` | active source specification | Current vNext-only Discovery model. |

## Active Operator Docs

| Path | Classification | Notes |
| --- | --- | --- |
| `docs/product/operator/HOW_TO_USE.md` | active operator guide | Daily admin workflow, channels, adapters, rules, hidden-signal hard-gate safety, sequences, discovery and MCP. |
| `docs/product/operator/hidden-signal-selection.md` | active operator reference | Three signal visibility types, hard-gate safety, candidateSignals contract and replay proof expectations. |
| `docs/product/operator/manual-mvp-runbook.md` | active runbook | Manual local stack and operator verification pass. |
| `docs/product/operator/local-product-testing.md` | active proof guide | Product-local and area-specific test commands. |
| `docs/product/operator/setup/firebase_setup.md` | active setup guide | Firebase/admin sign-in setup. |
| `docs/product/operator/mcp/README.md` | active MCP index | Current MCP assumptions, tool/resource/prompt model, strict read-back/proof and hidden-signal guidance. |
| `docs/product/operator/mcp/client-setups.md` | active MCP setup examples | Client config examples. |
| `docs/product/operator/mcp/http-smoke.md` | active MCP HTTP examples | Direct JSON-RPC smoke examples. |
| `docs/product/operator/mcp/testing.md` | active MCP proof guide | Local and remote MCP proof lanes. |

## Active Examples And Assets

| Path | Classification | Notes |
| --- | --- | --- |
| `docs/product/operator/examples/EXAMPLES.md` | active example index | Short index to active example entry points; not an acceptance gate. |
| `docs/product/operator/examples/WEBSITE_SOURCES_TESTING.md` | active website testing handbook | Current website/resource/projection verification guide. |
| `docs/product/data-scripts/README.md` | active asset index | Defines JSON asset role and limits. |
| `docs/product/data-scripts/*.json` | reference JSON assets | Manual import/reference assets, not runtime truth. |

## Historical Example Archive

| Path | Classification | Notes |
| --- | --- | --- |
| `docs/product/operator/old_examples/README.md` | archive index | Explains old example status. |
| `docs/product/operator/old_examples/EXAMPLES.archive.md` | historical example bundle | Old bundle prose retained for comparison only. |
| `docs/product/operator/old_examples/WEBSITE_SOURCE_EXAMPLES.md` | historical example-only reference | Dated live URL examples; use active website testing doc first. |
| `docs/product/operator/old_examples/outsource_balanced_templates.md` | historical companion note | Old outsourcing template companion. |
| `docs/archive/ingress-adapter-catalog-plan.md` | historical implementation/design note | Retained design notes; active runtime truth is catalog + binding. |

## AIDP Runtime Docs

| Path | Classification | Notes |
| --- | --- | --- |
| `.aidp/AGENTS.md` | AIDP runtime contract | How agents work in this repo. |
| `.aidp/work.md` | live work state | Current active item and proof state. |
| `.aidp/blueprint.md` | durable system truth for agents | Higher authority than product docs for agent runtime. |
| `.aidp/engineering.md` | engineering discipline | Route-aware implementation rules. |
| `.aidp/verification.md` | proof policy | Canonical gate map. |
| `.aidp/contracts/*.md` | subsystem contracts | Deep contracts for recurring boundary-sensitive work. |

## Maintenance Rules

- Active docs must not link to deleted Discovery v3 guides or removed example harnesses.
- Historical files under `old_examples` may mention old flows, but must be marked inactive.
- Product docs can explain behavior; `.aidp/*` owns agent runtime truth.
- Any documented `pnpm ...` command should exist in `package.json` unless explicitly shown as an external generic command.
