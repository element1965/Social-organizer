export const CADENCE_SAMPLES = 9;
export const RESOLUTION_WINDOW_MS = 1500;

const UPGRADE_QUIET_MS = 10_000;
const FIRST_RETRY_MS = 12_000;
const MAX_RETRY_MS = 120_000;

interface ResolutionState {
  cadence: number;
  tier: number;
  trial: { kind: 'downgrade'; frameTime: number } | { kind: 'upgrade' } | null;
  downgradeBlocked: boolean;
  upgradeAllowed: boolean;
  quietMs: number;
  retryAt: number;
  retryDelay: number;
}

export function measureCadence(frames: readonly number[]): number {
  const sorted = [...frames].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
}

export function createResolutionState(cadence: number): ResolutionState {
  return {
    cadence,
    tier: 0,
    trial: null,
    downgradeBlocked: false,
    upgradeAllowed: true,
    quietMs: 0,
    retryAt: 0,
    retryDelay: FIRST_RETRY_MS,
  };
}

export function resetResolution(state: ResolutionState): ResolutionState {
  // A resize or visibility change invalidates an in-flight tier comparison.
  const tier = state.tier + (state.trial?.kind === 'upgrade' ? 1 : state.trial ? -1 : 0);
  return { ...state, tier, trial: null, downgradeBlocked: false, upgradeAllowed: true, quietMs: 0 };
}

export function updateResolution(
  state: ResolutionState,
  frames: readonly number[],
  now: number,
  lastTier: number,
): ResolutionState {
  let duration = 0;
  let totalFrameTime = 0;
  let missed = 0;
  for (const elapsed of frames) {
    // Cap outliers for tier comparisons. One long task should not make a lower resolution look faster.
    totalFrameTime += Math.min(elapsed, state.cadence * 3);
    duration += elapsed;
    if (elapsed > state.cadence * 1.45) missed++;
  }
  const pressure = missed / frames.length;
  const slow = pressure >= 0.35;
  const quiet = pressure <= 0.1;
  const frameTime = totalFrameTime / frames.length;

  if (state.trial?.kind === 'downgrade') {
    const improved = state.trial.frameTime - frameTime >= state.cadence * 0.1;
    if (!improved) {
      return { ...state, tier: state.tier - 1, trial: null, downgradeBlocked: true, quietMs: 0 };
    }
    return { ...state, trial: null, quietMs: quiet ? duration : 0 };
  }

  if (state.trial?.kind === 'upgrade') {
    if (!quiet) {
      // A smooth lower tier alone gives no evidence that the higher tier has become viable.
      return {
        ...state,
        tier: state.tier + 1,
        trial: null,
        upgradeAllowed: false,
        quietMs: 0,
        retryAt: now + state.retryDelay,
        retryDelay: Math.min(state.retryDelay * 2, MAX_RETRY_MS),
      };
    }
    return { ...state, trial: null, retryAt: 0, retryDelay: FIRST_RETRY_MS };
  }

  if (slow && state.tier < lastTier && !state.downgradeBlocked) {
    return { ...state, tier: state.tier + 1, trial: { kind: 'downgrade', frameTime }, quietMs: 0 };
  }

  if (!quiet) return { ...state, quietMs: 0 };

  const quietMs = state.quietMs + duration;
  if (state.tier > 0 && state.upgradeAllowed && quietMs >= UPGRADE_QUIET_MS && now >= state.retryAt) {
    return { ...state, tier: state.tier - 1, trial: { kind: 'upgrade' }, downgradeBlocked: false, quietMs: 0 };
  }
  return { ...state, downgradeBlocked: false, quietMs };
}
