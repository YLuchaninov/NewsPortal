import { readOptionalString } from "../protocol";

export type FunnelReadScope = {
  funnelId: string | null;
  laneId: string | null;
};

export function readFunnelReadScope(args: Record<string, unknown> = {}): FunnelReadScope {
  return {
    funnelId: readOptionalString(args.funnelId) ?? null,
    laneId: readOptionalString(args.laneId) ?? null,
  };
}

export function hasFunnelReadScope(scope: FunnelReadScope): boolean {
  return Boolean(scope.funnelId || scope.laneId);
}

export function appendSelectionFunnelScopeClause(
  params: unknown[],
  scope: FunnelReadScope,
  fsrAlias = "fsr",
  parameterOffset = 1
): string | null {
  if (!hasFunnelReadScope(scope)) {
    return null;
  }
  const clauses = [
    `ifr_scope.doc_id = ${fsrAlias}.doc_id`,
    "ifr_scope.filter_scope = 'system_criterion'",
  ];
  if (scope.funnelId) {
    clauses.push(`fsib_scope.funnel_id = $${parameterOffset + params.push(scope.funnelId) - 1}::uuid`);
  }
  if (scope.laneId) {
    clauses.push(`fsib_scope.lane_id = $${parameterOffset + params.push(scope.laneId) - 1}::uuid`);
  }
  return `
    exists (
      select 1
      from interest_filter_results ifr_scope
      join criteria c_scope on c_scope.criterion_id = ifr_scope.criterion_id
      join funnel_system_interest_bindings fsib_scope
        on fsib_scope.interest_template_id = c_scope.source_interest_template_id
      where ${clauses.join(" and ")}
    )
  `;
}

export function appendSourceFunnelScopeClause(
  params: unknown[],
  scope: FunnelReadScope,
  signalCandidateAlias = "a",
  parameterOffset = 1
): string | null {
  if (!hasFunnelReadScope(scope)) {
    return null;
  }
  const clauses = [`fsb_scope.channel_id = ${signalCandidateAlias}.channel_id`];
  if (scope.funnelId) {
    clauses.push(`fsb_scope.funnel_id = $${parameterOffset + params.push(scope.funnelId) - 1}::uuid`);
  }
  if (scope.laneId) {
    clauses.push(`fsb_scope.lane_id = $${parameterOffset + params.push(scope.laneId) - 1}::uuid`);
  }
  return `
    exists (
      select 1
      from funnel_source_bindings fsb_scope
      where ${clauses.join(" and ")}
    )
  `;
}
