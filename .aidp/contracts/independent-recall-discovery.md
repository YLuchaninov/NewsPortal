# Контракт independent recall discovery

Этот contract сохранен как supersession note для старой dual-path discovery модели.

## Status

Superseded by `.aidp/contracts/discovery-agent.md`.

Independent recall used to add neutral acquisition beside graph-first missions through `discovery_recall_missions` and `discovery_recall_candidates`. The resilient discovery rebuild folds surviving recall ideas into the new target/coverage/evidence model:

- neutral wide acquisition becomes provider-card-gated hypotheses;
- generic source quality becomes domain inventory, endpoint quality and source health;
- recall candidates become `discovery_source_endpoints` or `discovery_signal_clusters`;
- recall promotion becomes endpoint promotion through the same `source_channels` registrar/outbox discipline.

## Durable carried-forward rules

- Source-channel onboarding must keep PostgreSQL + outbox discipline.
- Generic quality and target fit remain separate scores.
- Interest-independent acquisition must not bypass downstream source/content safety gates.
- Wide recall is useful, but noisy candidates require evidence, scoring and operator-visible status.

## Update trigger

Delete this file only when old recall code, old recall docs and old recall tests have been fully removed and `.aidp/history.md` records the completed cutover.
