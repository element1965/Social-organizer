import { monitorEventLoopDelay } from 'node:perf_hooks';
import { graphStats } from './graph-cache.service.js';

/**
 * One line a minute about what limits a single API process: how long the event loop was blocked,
 * memory, how the handshake graph was kept up to date, and how long network walks took.
 * It answers "when is the next scale step due": the launch plan names the thresholds
 * (event loop p95 over 100 ms, a walk over 50 ms, full graph reloads over 1 s or more often than hourly).
 * Numbers only: nothing about a person or a request is logged.
 */

export type WalkKind = 'reach' | 'wave';

interface Timing {
  count: number;
  totalMs: number;
  maxMs: number;
}

const empty = (): Timing => ({ count: 0, totalMs: 0, maxMs: 0 });
let requests = 0;

/** One HTTP request reached the server (every route). The line shows how many came in the last minute. */
export function countRequest(): void {
  requests++;
}
const walks: Record<WalkKind, Timing> = { reach: empty(), wave: empty() };

/** A network walk finished: `reach` is the count up to the 6th handshake, `wave` is choosing who a Need notifies. */
export function recordWalk(kind: WalkKind, ms: number): void {
  const t = walks[kind];
  t.count++;
  t.totalMs += ms;
  if (ms > t.maxMs) t.maxMs = ms;
}

/** Times an async walk and records it, whatever its outcome. */
export async function timedWalk<T>(kind: WalkKind, run: () => Promise<T>): Promise<T> {
  const startedAt = performance.now();
  try {
    return await run();
  } finally {
    recordWalk(kind, performance.now() - startedAt);
  }
}

/** The histogram samples every this many ms; an idle loop reads as exactly this, so it is subtracted. */
const LOOP_RESOLUTION_MS = 20;
const mb = (bytes: number) => Math.round(bytes / 1048576);
const ms = (nanoseconds: number) => Math.max(0, Math.round(nanoseconds / 1e6) - LOOP_RESOLUTION_MS);

function timingText(t: Timing): string {
  if (t.count === 0) return '0';
  return `${t.count} avg ${Math.round(t.totalMs / t.count)} ms max ${Math.round(t.maxMs)} ms`;
}

let timer: NodeJS.Timeout | null = null;

/** The metrics as one object: used by the log line and by checks. Resets the per-minute timings. */
export function takeRuntimeMetrics(loop?: ReturnType<typeof monitorEventLoopDelay>) {
  const memory = process.memoryUsage();
  const graph = graphStats();
  const out = {
    // How much later than planned the loop got to its timer: 0 when idle, the length of the block when blocked
    loopP50Ms: loop ? ms(loop.percentile(50)) : 0,
    loopP95Ms: loop ? ms(loop.percentile(95)) : 0,
    loopMaxMs: loop ? ms(loop.max) : 0,
    requests,
    rssMb: mb(memory.rss),
    heapMb: mb(memory.heapUsed),
    graph,
    reach: { ...walks.reach },
    wave: { ...walks.wave },
  };
  requests = 0;
  walks.reach = empty();
  walks.wave = empty();
  loop?.reset();
  return out;
}

export function formatRuntimeMetrics(m: ReturnType<typeof takeRuntimeMetrics>): string {
  const g = m.graph;
  return (
    `[metrics] loop p50 ${m.loopP50Ms} ms p95 ${m.loopP95Ms} ms max ${m.loopMaxMs} ms · ` +
    `requests ${m.requests} · rss ${m.rssMb} MB heap ${m.heapMb} MB · ` +
    `graph ${g.people} people ${g.connections} connections, reloads ${g.fullLoads} (last ${g.lastLoadMs} ms), ` +
    `re-reads ${g.refreshes}, appends ${g.appends}, rebuilds ${g.compactions}, loose ${g.overflow}+${g.holes}, light checks ${g.lightChecks}, exact signature ${g.lastSignatureMs} ms · ` +
    `reach ${timingText(m.reach)} · wave ${timingText(m.wave)}`
  );
}

/** Starts the once-a-minute line. Safe to call twice; the timer never keeps the process alive. */
export function startRuntimeMetrics(intervalMs = 60_000): void {
  if (timer) return;
  const loop = monitorEventLoopDelay({ resolution: LOOP_RESOLUTION_MS });
  loop.enable();
  timer = setInterval(() => {
    console.log(formatRuntimeMetrics(takeRuntimeMetrics(loop)));
  }, intervalMs);
  timer.unref();
}
