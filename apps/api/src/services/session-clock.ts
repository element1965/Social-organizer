// The one clock behind sessions (SEC-1): the first-proof cutoff (`emailVerifiedAt`) and every token's issue
// time are both read here, in this process, never from the database clock. It never goes backwards, so a
// token issued after a cutoff was written carries an issue time at or after it, even if the wall clock is
// stepped back in between; equal counts as after (auth.service.ts, issuedBeforeEmailProof).
// Kept apart from token code so the identity services need no signing secret to load.

let lastMs = 0;

/** Milliseconds since the epoch, never less than a value this function returned before. */
export function sessionClockMs(): number {
  const now = Date.now();
  if (now > lastMs) lastMs = now;
  return lastMs;
}

/** The clock as a Date, for writing `emailVerifiedAt`. */
export function sessionClockDate(): Date {
  return new Date(sessionClockMs());
}
