export type ProviderOutcome = 'sent' | 'retry' | 'retired';
export type DeliveryGate = () => Promise<boolean>;
export type PushDestination =
  | { kind: 'web'; id: string }
  | { kind: 'native'; id: string; platform: string };
export type PushDeliveryGate = (destination: PushDestination) => Promise<boolean | 'skip'>;

/** One accepted device is enough to deliver to the person. */
export function mergeProviderOutcomes(a: ProviderOutcome, b: ProviderOutcome): ProviderOutcome {
  if (a === 'sent' || b === 'sent') return 'sent';
  return a === 'retry' || b === 'retry' ? 'retry' : 'retired';
}

export function recordProviderOutcome(outcomes: Map<string, ProviderOutcome>, userId: string, outcome: ProviderOutcome) {
  outcomes.set(userId, mergeProviderOutcomes(outcomes.get(userId) ?? 'retired', outcome));
}
