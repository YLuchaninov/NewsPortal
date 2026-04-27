export const DETERMINISTIC_SCENARIO_ORDER = [
  "auth-and-token-lifecycle",
  "protocol-discovery",
  "template-interest-channel-flows",
  "sequence-operator-flows",
  "discovery-operator-flows",
  "content-analysis-operator-flows",
  "read-only-operator-needs",
  "negative-scope-and-destructive-policy",
  "request-log-and-audit-evidence",
  "doc-parity-matrix",
];

export const DETERMINISTIC_SCENARIO_GROUPS = {
  auth: ["auth-and-token-lifecycle"],
  reads: ["protocol-discovery", "read-only-operator-needs", "doc-parity-matrix"],
  writes: [
    "template-interest-channel-flows",
    "sequence-operator-flows",
    "discovery-operator-flows",
    "content-analysis-operator-flows",
    "negative-scope-and-destructive-policy",
    "request-log-and-audit-evidence",
  ],
  discovery: ["discovery-operator-flows", "read-only-operator-needs", "doc-parity-matrix"],
};
