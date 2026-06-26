/**
 * Pure cron primitives shared by the in-memory CronScheduler and the
 * gateway-owned channel scheduler, so the two cannot drift. No I/O, no state.
 */
import { matches, nextFireTime } from '../utils/cronParser.js';

/** Recurring jobs auto-expire this long after creation; age is checked at fire time. */
export const RECURRING_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
/** Recurring jitter: up to 10% of the period, capped at 15 minutes. */
export const MAX_RECURRING_JITTER_MS = 15 * 60 * 1000;
/** One-shot jitter: up to 90s early for fire times landing on :00 or :30. */
export const MAX_ONESHOT_JITTER_MS = 90 * 1000;

function hashId(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

/**
 * Deterministic jitter offset from a job ID and its cron period.
 * Recurring: up to 10% of period, capped at 15 min (added after fire time).
 * One-shot landing on :00/:30: up to 90s early (subtracted). Otherwise 0.
 */
export function computeJitter(
  id: string,
  cronExpr: string,
  recurring: boolean,
): number {
  const hash = hashId(id);

  if (recurring) {
    const now = new Date();
    try {
      const first = nextFireTime(cronExpr, now);
      const second = nextFireTime(cronExpr, first);
      const periodMs = second.getTime() - first.getTime();
      const tenPercent = periodMs * 0.1;
      const maxJitter = Math.min(tenPercent, MAX_RECURRING_JITTER_MS);
      return hash % Math.max(1, Math.floor(maxJitter));
    } catch {
      return 0;
    }
  }

  try {
    const next = nextFireTime(cronExpr, new Date());
    if (next.getMinutes() % 30 === 0) {
      return -(hash % MAX_ONESHOT_JITTER_MS);
    }
  } catch {
    // fall through
  }

  return 0;
}

/** 8-char [a-z0-9] random id. */
export function generateId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let id = '';
  for (let i = 0; i < 8; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

/**
 * Next fire time (ms) for `cronExpr` strictly after `afterMs`, plus `jitterMs`.
 * Returns null if the parser finds no match within its horizon.
 */
export function computeNextFireMs(
  cronExpr: string,
  afterMs: number,
  jitterMs: number,
): number | null {
  try {
    const next = nextFireTime(cronExpr, new Date(afterMs));
    return next.getTime() + jitterMs;
  } catch {
    return null;
  }
}

/**
 * Scan the jitter window around `currentMs` for the newest minute-slot whose
 * (jittered) fire time has arrived and is later than `lastFiredAt`. Returns that
 * minute (ms, seconds zeroed) to stamp as the new lastFiredAt, or null if none
 * is due. The `>=` guard means a catch-up stamp at the current minute suppresses
 * every older missed slot, so N missed slots collapse to a single fire.
 */
export function dueMatchedMinute(
  cronExpr: string,
  jitterMs: number,
  lastFiredAt: number | null | undefined,
  currentMs: number,
): number | null {
  const windowMinutes = Math.ceil(Math.abs(jitterMs) / 60_000);
  const nowMinuteStart = new Date(currentMs);
  nowMinuteStart.setSeconds(0, 0);
  const nowMinuteMs = nowMinuteStart.getTime();

  let matchedMinuteMs: number | null = null;
  for (let offset = -windowMinutes; offset <= windowMinutes; offset++) {
    const candidateMs = nowMinuteMs + offset * 60_000;
    if (!matches(cronExpr, new Date(candidateMs))) continue;
    const fireTimeMs = candidateMs + jitterMs;
    if (currentMs >= fireTimeMs) {
      if (matchedMinuteMs === null || candidateMs > matchedMinuteMs) {
        matchedMinuteMs = candidateMs;
      }
    }
  }

  if (matchedMinuteMs === null) return null;
  if (lastFiredAt != null && lastFiredAt >= matchedMinuteMs) return null;
  return matchedMinuteMs;
}
