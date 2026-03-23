import {
  defaultMaxPollIntervalSeconds,
  type NormalizedFetchOutcome,
  type SourceChannelRuntimeState
} from "@newsportal/contracts";

export const ADAPTIVE_MULTIPLIERS = [1, 2, 4, 8, 16] as const;

interface RuntimeStateOverrides {
  adaptiveEnabled?: boolean | null;
  effectivePollIntervalSeconds?: number | null;
  maxPollIntervalSeconds?: number | null;
  nextDueAt?: string | null;
  adaptiveStep?: number | null;
  lastResultKind?: NormalizedFetchOutcome | null;
  consecutiveNoChangePolls?: number | null;
  consecutiveFailures?: number | null;
  adaptiveReason?: string | null;
}

export interface AdaptiveTransitionInput {
  basePollIntervalSeconds: number;
  fetchedAt: string;
  outcome: NormalizedFetchOutcome;
  retryAfterSeconds?: number | null;
  state?: RuntimeStateOverrides | null;
}

function clampPositiveInteger(value: number, fallback: number): number {
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function clampNonNegativeInteger(value: number, fallback = 0): number {
  return Number.isInteger(value) && value >= 0 ? value : fallback;
}

function addSeconds(isoTimestamp: string, seconds: number): string {
  return new Date(new Date(isoTimestamp).getTime() + seconds * 1000).toISOString();
}

export function resolveRuntimeState(
  basePollIntervalSeconds: number,
  state?: RuntimeStateOverrides | null
): SourceChannelRuntimeState {
  const maxPollIntervalSeconds = clampPositiveInteger(
    Number(state?.maxPollIntervalSeconds),
    defaultMaxPollIntervalSeconds(basePollIntervalSeconds)
  );
  const effectivePollIntervalSeconds = Math.min(
    Math.max(
      clampPositiveInteger(
        Number(state?.effectivePollIntervalSeconds),
        basePollIntervalSeconds
      ),
      basePollIntervalSeconds
    ),
    maxPollIntervalSeconds
  );

  return {
    adaptiveEnabled: state?.adaptiveEnabled !== false,
    effectivePollIntervalSeconds,
    maxPollIntervalSeconds,
    nextDueAt: state?.nextDueAt ?? null,
    adaptiveStep: Math.min(
      clampNonNegativeInteger(Number(state?.adaptiveStep ?? 0)),
      ADAPTIVE_MULTIPLIERS.length - 1
    ),
    lastResultKind: state?.lastResultKind ?? null,
    consecutiveNoChangePolls: clampNonNegativeInteger(
      Number(state?.consecutiveNoChangePolls ?? 0)
    ),
    consecutiveFailures: clampNonNegativeInteger(Number(state?.consecutiveFailures ?? 0)),
    adaptiveReason: state?.adaptiveReason ?? null
  };
}

function computeNoChangeState(
  basePollIntervalSeconds: number,
  fetchedAt: string,
  state: SourceChannelRuntimeState
): SourceChannelRuntimeState {
  if (!state.adaptiveEnabled) {
    return {
      ...state,
      effectivePollIntervalSeconds: basePollIntervalSeconds,
      nextDueAt: addSeconds(fetchedAt, basePollIntervalSeconds),
      adaptiveStep: 0,
      lastResultKind: "no_change",
      consecutiveNoChangePolls: state.consecutiveNoChangePolls + 1,
      consecutiveFailures: 0,
      adaptiveReason: "adaptive_disabled"
    };
  }

  const nextStep = Math.min(state.adaptiveStep + 1, ADAPTIVE_MULTIPLIERS.length - 1);
  const nextEffectivePollIntervalSeconds = Math.min(
    basePollIntervalSeconds * ADAPTIVE_MULTIPLIERS[nextStep],
    state.maxPollIntervalSeconds
  );

  return {
    ...state,
    effectivePollIntervalSeconds: nextEffectivePollIntervalSeconds,
    nextDueAt: addSeconds(fetchedAt, nextEffectivePollIntervalSeconds),
    adaptiveStep: nextStep,
    lastResultKind: "no_change",
    consecutiveNoChangePolls: state.consecutiveNoChangePolls + 1,
    consecutiveFailures: 0,
    adaptiveReason: `no_change_x${Math.max(1, Math.floor(nextEffectivePollIntervalSeconds / basePollIntervalSeconds))}`
  };
}

function computeRetryDelaySeconds(
  basePollIntervalSeconds: number,
  state: SourceChannelRuntimeState,
  retryAfterSeconds: number | null | undefined
): number {
  if (Number.isInteger(retryAfterSeconds) && Number(retryAfterSeconds) > 0) {
    return Math.min(
      Math.max(Number(retryAfterSeconds), basePollIntervalSeconds),
      state.maxPollIntervalSeconds
    );
  }

  const failureMultiplier = Math.min(state.consecutiveFailures + 1, 4);
  return Math.min(
    Math.max(basePollIntervalSeconds * failureMultiplier, basePollIntervalSeconds),
    Math.min(state.maxPollIntervalSeconds, basePollIntervalSeconds * 4)
  );
}

export function computeAdaptiveTransition(
  input: AdaptiveTransitionInput
): SourceChannelRuntimeState {
  const currentState = resolveRuntimeState(input.basePollIntervalSeconds, input.state);
  const fetchedAt = input.fetchedAt;

  switch (input.outcome) {
    case "new_content":
      return {
        ...currentState,
        effectivePollIntervalSeconds: input.basePollIntervalSeconds,
        maxPollIntervalSeconds: currentState.maxPollIntervalSeconds,
        nextDueAt: addSeconds(fetchedAt, input.basePollIntervalSeconds),
        adaptiveStep: 0,
        lastResultKind: "new_content",
        consecutiveNoChangePolls: 0,
        consecutiveFailures: 0,
        adaptiveReason: "reset_on_new_content"
      };
    case "no_change":
      return computeNoChangeState(input.basePollIntervalSeconds, fetchedAt, currentState);
    case "rate_limited": {
      const retryDelaySeconds = computeRetryDelaySeconds(
        input.basePollIntervalSeconds,
        currentState,
        input.retryAfterSeconds
      );
      return {
        ...currentState,
        nextDueAt: addSeconds(fetchedAt, retryDelaySeconds),
        lastResultKind: "rate_limited",
        consecutiveFailures: currentState.consecutiveFailures + 1,
        adaptiveReason: "rate_limited_backoff"
      };
    }
    case "transient_failure": {
      const retryDelaySeconds = computeRetryDelaySeconds(
        input.basePollIntervalSeconds,
        currentState,
        input.retryAfterSeconds
      );
      return {
        ...currentState,
        nextDueAt: addSeconds(fetchedAt, retryDelaySeconds),
        lastResultKind: "transient_failure",
        consecutiveFailures: currentState.consecutiveFailures + 1,
        adaptiveReason: "transient_failure_backoff"
      };
    }
    case "hard_failure":
      return {
        ...currentState,
        nextDueAt: addSeconds(fetchedAt, currentState.effectivePollIntervalSeconds),
        lastResultKind: "hard_failure",
        consecutiveFailures: currentState.consecutiveFailures + 1,
        adaptiveReason: "hard_failure_needs_attention"
      };
    default:
      return currentState;
  }
}
