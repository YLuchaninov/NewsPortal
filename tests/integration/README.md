# Integration tests

Use this directory for bounded tests that cross module or service boundaries and need local fixture setup.

Keep integration tests separate from `infra/scripts/` product proof harnesses. A test belongs here when it is meant to be a regular engineering regression gate rather than an operator runbook or full product acceptance flow.
