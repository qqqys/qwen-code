import {
  computeJitter,
  computeNextFireMs,
  dueMatchedMinute,
  generateId,
  nextFireTime,
  parseCron,
  RECURRING_MAX_AGE_MS,
} from '@qwen-code/qwen-code-core';
import type { SessionRouter } from '@qwen-code/channel-base';
import type { ChannelCronJob, ChannelCronStore } from './channel-cron-store.js';

/** Reconciler cadence; also the cap on any single armed timer (no multi-day setTimeout). */
const RECONCILE_INTERVAL_MS = 60_000;
/** A reconciler gap this far from the expected interval means a clock jump / suspend-resume. */
const SKEW_THRESHOLD_MS = 90_000;
/** Disable a job after this many consecutive dispatch failures. */
const MAX_CONSECUTIVE_FAILURES = 3;
/** Hard cap on stored jobs (mirrors core's MAX_JOBS). */
const MAX_JOBS = 50;
/** A hung fire is force-failed after this long so it can't pin its inFlight slot. */
const DISPATCH_TIMEOUT_MS = 5 * 60_000;
/** A one-shot missed during downtime fires only if it's no later than this. */
const MISSED_ONESHOT_MAX_LATE_MS = 60 * 60_000;

/**
 * Dispatch a due job. `matchedMinuteMs` is the minute slot being satisfied — the
 * scheduler stamps it as `lastFiredAt` so a retry waits for the next slot rather
 * than hot-looping. Rejection trips the circuit breaker.
 */
export type ProactiveFire = (
  job: ChannelCronJob,
  matchedMinuteMs: number,
) => Promise<void>;

/** Minimal slice of a connected channel the proactive fire path needs. */
interface ProactiveDispatcher {
  dispatchProactive(
    sessionId: string,
    chatId: string,
    promptText: string,
  ): Promise<string>;
}

/**
 * Build the `onFire` the scheduler calls: re-resolve the routed session (pinning
 * `target.cwd` so a cold group lands in the channel's workspace, not the
 * gateway's process.cwd()) and hand the prompt to the channel's serialized
 * proactive seam. Prepending `[scheduled task]` is the scheduler's attribution —
 * `dispatchProactive` bypasses the inbound `[who]` prefix, so this is the sole
 * marker. Extracted (not inline in start.ts) so the cwd-routing is unit-testable.
 */
export function createProactiveFire(
  router: Pick<SessionRouter, 'resolve'>,
  channels: ReadonlyMap<string, ProactiveDispatcher>,
): ProactiveFire {
  return async (job) => {
    const t = job.target;
    const sessionId = await router.resolve(
      t.channelName,
      t.senderId ?? '__scheduler__',
      t.chatId,
      t.threadId,
      t.cwd,
    );
    const channel = channels.get(t.channelName);
    if (!channel) {
      throw new Error(`proactive fire: no channel "${t.channelName}"`);
    }
    await channel.dispatchProactive(
      sessionId,
      t.chatId,
      `[scheduled task] ${job.prompt}`,
    );
  };
}

/**
 * Gateway-owned, durable cron scheduler. Unlike the in-session CronScheduler
 * (torn down on Session.dispose), this is owned by the channel gateway process,
 * survives restarts via {@link ChannelCronStore}, and fires prompts proactively
 * into shared group sessions through `onFire`. The single daemon (pidfile-guarded
 * in start.ts) is sole owner, so there is no lock/owner gate.
 *
 * Two timers: a re-armed setTimeout (precise, never longer than the reconcile
 * interval) plus a 60s reconciler that backstops clock skew/sleep drift and
 * picks up create/delete from the in-process mutation API.
 *
 * Concurrency: `inFlight` is the single guard against re-firing a job whose
 * async dispatch hasn't settled. `lastFiredAt` is stamped exactly once per fire
 * (in {@link fireDue}'s settle), to `matchedMinuteMs` — both on success and on
 * failure — so neither catch-up nor the breaker can race the stamp or double-fire.
 */
export class ChannelCronScheduler {
  private jobs = new Map<string, ChannelCronJob>();
  /** Jobs whose dispatch is in flight — excluded from due-computation and re-fire. */
  private readonly inFlight = new Set<string>();
  private armTimer: ReturnType<typeof setTimeout> | null = null;
  private reconcileTimer: ReturnType<typeof setInterval> | null = null;
  private lastReconcileAt = 0;
  private started = false;
  /** Serializes persists so a slow write can't clobber a newer snapshot. */
  private persistChain: Promise<void> = Promise.resolve();

  constructor(
    private readonly store: ChannelCronStore,
    private readonly router: SessionRouter,
    private readonly onFire: ProactiveFire,
  ) {}

  /** Load persisted jobs, run restart catch-up, then arm both timers. */
  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    this.jobs = new Map(this.store.load().map((j) => [j.id, j]));
    const now = Date.now();
    this.runCatchUp(now);
    this.lastReconcileAt = now;
    this.reconcileTimer = setInterval(
      () => this.reconcile(),
      RECONCILE_INTERVAL_MS,
    );
    // Safe to unref: the channel SDK sockets (and start.ts's hold-open promise)
    // keep the event loop alive, so this tick never needs to.
    this.reconcileTimer.unref?.();
    this.arm();
  }

  stop(): void {
    this.started = false;
    if (this.armTimer) {
      clearTimeout(this.armTimer);
      this.armTimer = null;
    }
    if (this.reconcileTimer) {
      clearInterval(this.reconcileTimer);
      this.reconcileTimer = null;
    }
  }

  /**
   * Create a job for a routed session. Rejects user-scoped channels: a proactive
   * fire there would mint a per-user phantom session instead of reaching the
   * shared group. Validates the cron parses AND has a future match (rejecting
   * never-match exprs like `0 0 30 2 *`).
   */
  async createForSession(
    sessionId: string,
    cron: string,
    prompt: string,
    recurring: boolean,
  ): Promise<ChannelCronJob> {
    parseCron(cron);
    nextFireTime(cron, new Date());

    const target = this.router.getTarget(sessionId);
    if (!target) {
      throw new Error(`cannot schedule: unknown session ${sessionId}`);
    }
    if (this.router.getScope(target.channelName) === 'user') {
      throw new Error(
        `cannot schedule in user-scoped channel "${target.channelName}": a ` +
          `proactive fire would mint a per-user phantom session, not the group.`,
      );
    }
    const cwd = this.router.getCwd(sessionId);
    if (!cwd) {
      throw new Error(`cannot schedule: no workspace for session ${sessionId}`);
    }
    if (this.jobs.size >= MAX_JOBS) {
      throw new Error(`cannot schedule: job limit (${MAX_JOBS}) reached`);
    }

    let id = generateId();
    while (this.jobs.has(id)) id = generateId();
    const job: ChannelCronJob = {
      id,
      cron,
      prompt,
      recurring,
      createdAt: Date.now(),
      lastFiredAt: null,
      jitterMs: computeJitter(id, cron, recurring),
      target: {
        channelName: target.channelName,
        chatId: target.chatId,
        threadId: target.threadId,
        senderId: '__scheduler__',
        cwd,
      },
    };
    this.jobs.set(id, job);
    await this.persist();
    this.arm();
    return job;
  }

  /** Delete a job iff it belongs to the calling session's routing scope. */
  async deleteForSession(sessionId: string, id: string): Promise<boolean> {
    const job = this.jobs.get(id);
    const target = this.router.getTarget(sessionId);
    if (!job || !target) return false;
    if (
      this.router.keyForTarget(job.target) !== this.router.keyForTarget(target)
    ) {
      return false;
    }
    this.jobs.delete(id);
    this.inFlight.delete(id);
    await this.persist();
    this.arm();
    return true;
  }

  /** Jobs visible to a session — scoped by routing key (thread/single = the group). */
  listForSession(sessionId: string): ChannelCronJob[] {
    const target = this.router.getTarget(sessionId);
    if (!target) return [];
    const key = this.router.keyForTarget(target);
    return [...this.jobs.values()].filter(
      (j) => this.router.keyForTarget(j.target) === key,
    );
  }

  /**
   * Restart catch-up. Mirrors the in-session loadFileTasks classification: for
   * each overdue job (`computeNextFireMs(anchor) < now`), fire once now collapsed
   * to the current minute (the lastFiredAt stamp suppresses every older missed
   * slot), then drop one-shots/aged-recurring after the fire. A one-shot missed
   * by more than the staleness window is dropped without firing.
   */
  private runCatchUp(now: number): void {
    const nowMinuteMs = now - (now % 60_000);
    let dropped = false;
    for (const job of [...this.jobs.values()]) {
      if (job.disabledAt || this.inFlight.has(job.id)) continue;
      const anchor = job.recurring
        ? (job.lastFiredAt ?? job.createdAt)
        : job.createdAt;
      const nextFire = computeNextFireMs(job.cron, anchor, job.jitterMs);
      if (nextFire === null || nextFire >= now) continue; // not overdue
      if (!job.recurring && now - nextFire >= MISSED_ONESHOT_MAX_LATE_MS) {
        this.jobs.delete(job.id);
        dropped = true;
        this.logLine(
          `dropped one-shot ${job.id}: missed by ${Math.round((now - nextFire) / 60_000)}m (> staleness window)`,
        );
        continue;
      }
      this.fireDue(job, nowMinuteMs);
    }
    if (dropped) void this.persist();
  }

  /** Re-arm the precise near-term timer at the earliest pending fire (capped). */
  private arm(): void {
    if (!this.started) return;
    if (this.armTimer) {
      clearTimeout(this.armTimer);
      this.armTimer = null;
    }
    const now = Date.now();
    let earliest: number | null = null;
    for (const job of this.jobs.values()) {
      if (job.disabledAt || this.inFlight.has(job.id)) continue;
      const anchor = job.recurring
        ? (job.lastFiredAt ?? job.createdAt)
        : job.createdAt;
      const next = computeNextFireMs(job.cron, anchor, job.jitterMs);
      if (next === null) continue;
      if (earliest === null || next < earliest) earliest = next;
    }
    if (earliest === null) return;
    const delay = Math.max(0, Math.min(earliest - now, RECONCILE_INTERVAL_MS));
    this.armTimer = setTimeout(() => this.tick(), delay);
  }

  /** Fire every job whose jittered minute slot has arrived, then re-arm. */
  private tick(): void {
    if (!this.started) return;
    const now = Date.now();
    for (const job of [...this.jobs.values()]) {
      if (job.disabledAt || this.inFlight.has(job.id)) continue;
      const matched = dueMatchedMinute(
        job.cron,
        job.jitterMs,
        job.lastFiredAt,
        now,
      );
      if (matched !== null) this.fireDue(job, matched);
    }
    this.arm();
  }

  /** 60s drift/skew backstop: on a clock jump re-run catch-up, then scan + re-arm. */
  private reconcile(): void {
    if (!this.started) return;
    const now = Date.now();
    const skew =
      Math.abs(now - (this.lastReconcileAt + RECONCILE_INTERVAL_MS)) >
      SKEW_THRESHOLD_MS;
    this.lastReconcileAt = now;
    if (skew) this.runCatchUp(now);
    this.tick();
  }

  /**
   * Dispatch one job. `inFlight` guards re-fire across the async window; the
   * single `lastFiredAt = matchedMinuteMs` stamp (here, on settle) is what
   * resolves the catch-up/breaker timing conflict — there is no competing
   * synchronous stamp, and the stamp lands on both success and failure so a
   * transient failure waits for the next slot instead of hot-looping the breaker.
   * One-shots and aged-out recurring jobs are consumed (deleted) after the attempt.
   */
  private fireDue(job: ChannelCronJob, matchedMinuteMs: number): void {
    if (this.inFlight.has(job.id) || job.disabledAt) return;
    this.inFlight.add(job.id);

    const aged =
      job.recurring && Date.now() - job.createdAt >= RECURRING_MAX_AGE_MS;
    const consume = !job.recurring || aged;

    let settled = false;
    const settle = (failed: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      this.inFlight.delete(job.id);
      if (consume) {
        this.jobs.delete(job.id);
      } else {
        job.lastFiredAt = matchedMinuteMs;
        if (failed) {
          job.consecutiveFailures = (job.consecutiveFailures ?? 0) + 1;
          if (job.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
            job.disabledAt = Date.now();
            this.logLine(
              `disabled ${job.id} after ${job.consecutiveFailures} consecutive failures`,
            );
          }
        } else {
          job.consecutiveFailures = 0;
        }
      }
      void this.persist();
      this.arm();
    };

    const timeout = setTimeout(() => {
      this.logLine(`fire ${job.id} timed out after ${DISPATCH_TIMEOUT_MS}ms`);
      settle(true);
    }, DISPATCH_TIMEOUT_MS);
    timeout.unref?.();

    this.onFire(job, matchedMinuteMs).then(
      () => settle(false),
      (err) => {
        this.logLine(
          `fire ${job.id} failed: ${err instanceof Error ? err.message : String(err)}`,
        );
        settle(true);
      },
    );
  }

  /**
   * Persist the whole map. Chained so concurrent persists serialize and snapshot
   * the latest state at write time — a slow write can't overwrite a newer one.
   */
  private persist(): Promise<void> {
    this.persistChain = this.persistChain
      .then(() => this.store.save([...this.jobs.values()]))
      .catch((err) => {
        this.logLine(
          `persist failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
    return this.persistChain;
  }

  private logLine(msg: string): void {
    process.stderr.write(`[cron] ${msg}\n`);
  }
}
